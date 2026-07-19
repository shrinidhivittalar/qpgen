"""
One-time migration: convert plain-text math/chemistry notation in the static
'questions' collection to proper LaTeX inline syntax ($...$ / $\\ce{...}$).

The LLM is asked only to insert LaTeX markup — question wording is never changed.
A JSON backup is written before any changes are made.

Usage:
  python scripts/latexify_questions.py              # process all subjects
  python scripts/latexify_questions.py --dry-run    # preview without saving
  python scripts/latexify_questions.py --subject maths
  python scripts/latexify_questions.py --subject science
"""

import argparse, json, os, re, sys, time
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient
from groq import Groq

load_dotenv(Path(__file__).parent.parent / "qp-builder" / ".env")

MONGO_URI = os.getenv("MONGODB_URI")
GROQ_KEY  = os.getenv("GROQ_API_KEY")
MODEL     = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

if not MONGO_URI or not GROQ_KEY:
    sys.exit("ERROR: MONGODB_URI and GROQ_API_KEY must be set in qp-builder/.env")

mongo       = MongoClient(MONGO_URI)
qs_col      = mongo["qp_builder"]["questions"]
groq_client = Groq(api_key=GROQ_KEY)

BATCH_SIZE = 3     # questions per Groq call (~3900 tokens, safely under 6000 TPM)
CALL_DELAY = 45    # seconds between calls — Groq free tier: 6000 TPM limit

PROMPT = """\
You are a LaTeX formatting assistant for Indian school exam questions (Karnataka SSLC).
Your ONLY job is to insert LaTeX markup for mathematical and chemical notation.
Do NOT change any words, grammar, sentence structure, or question wording.

Conversion rules:
- Chemical formulas     : H2SO4 → $\\ce{H2SO4}$, CO2 → $\\ce{CO2}$, H2O → $\\ce{H2O}$
- Chemical equations    : 2H2 + O2 → 2H2O  becomes  $\\ce{2H2 + O2 -> 2H2O}$
- Math powers           : x2 or x^2 → $x^2$ ,  a2+b2 → $a^2+b^2$
- Fractions (math only) : 3/4 when clearly a value → $\\frac{3}{4}$
- Square roots          : √x or sqrt(x) → $\\sqrt{x}$
- Greek letters as vars : alpha → $\\alpha$, beta → $\\beta$, theta → $\\theta$
- Already has $...$     : leave exactly as-is — do not double-wrap
- No math/chemistry     : return text exactly unchanged
- Prose fractions       : "one-third of the students" → leave as-is
- MCQ options           : apply the same rules to each option string

Input:  JSON array of {"qid":"...", "text":"...", "options": null | ["A","B","C","D"]}
Output: JSON array of {"qid":"...", "text":"...", "options": null | ["A","B","C","D"]}
Return ONLY the JSON array — no explanation, no markdown code fences.

Questions:
"""


def _strip_fences(raw: str) -> str:
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
    return raw.strip()


def _parse_json_array(raw: str) -> list[dict]:
    """
    Extract and parse a JSON array from raw LLM output.

    LLMs often output LaTeX backslashes as single \\ (e.g. \\frac, \\ce) which
    are invalid JSON escape sequences and cause json.loads to fail.
    If the first parse attempt fails, double all backslashes and retry — this
    makes \\frac → \\\\frac in the JSON text, which JSON decodes back to \\frac.
    """
    m = re.search(r"\[.*\]", raw, re.DOTALL)
    if not m:
        raise ValueError(f"No JSON array in response. Got: {raw[:200]}")
    candidate = m.group()
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        # Single backslashes from LaTeX (\frac, \ce, \alpha …) are not valid
        # JSON escapes. Double every backslash so JSON can parse them correctly.
        fixed = candidate.replace("\\", "\\\\")
        return json.loads(fixed)


def call_groq(batch: list[dict]) -> list[dict]:
    payload = json.dumps(
        [{"qid": q["qid"], "text": q["text"], "options": q.get("options")}
         for q in batch],
        ensure_ascii=False,
    )
    resp = groq_client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": PROMPT + payload}],
        max_tokens=3000,
        temperature=0.05,
    )
    raw = _strip_fences(resp.choices[0].message.content.strip())
    return _parse_json_array(raw)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",  action="store_true",
                        help="Print conversions without saving to DB")
    parser.add_argument("--subject",  default=None,
                        help="Only process this subject (maths / science)")
    parser.add_argument("--source",   default=None,
                        help="Only process this source (qp / textbook)")
    args = parser.parse_args()

    query = {}
    if args.subject:
        query["subject"] = args.subject
    if args.source:
        query["source"] = args.source
    questions = list(qs_col.find(query, {"_id": 0}))

    if not questions:
        print("No questions found.")
        return

    parts = [f"subject={args.subject}" if args.subject else "",
             f"source={args.source}"   if args.source  else ""]
    label = " (" + ", ".join(p for p in parts if p) + ")" if any(parts) else ""
    print(f"Found {len(questions)} questions{label}.")

    # ── Backup ───────────────────────────────────────────────────────────────
    if not args.dry_run:
        ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
        bak  = Path(__file__).parent / f"latexify_backup_{ts}.json"
        with open(bak, "w", encoding="utf-8") as f:
            json.dump(questions, f, ensure_ascii=False, indent=2, default=str)
        print(f"Backup → {bak}\n")
    else:
        print("(dry-run — nothing will be saved)\n")

    # ── Batch processing ─────────────────────────────────────────────────────
    updated = skipped = errors = 0
    total_batches = (len(questions) + BATCH_SIZE - 1) // BATCH_SIZE

    for batch_idx in range(total_batches):
        batch    = questions[batch_idx * BATCH_SIZE : (batch_idx + 1) * BATCH_SIZE]
        qids_str = ", ".join(q["qid"] for q in batch)
        print(f"  [{batch_idx + 1}/{total_batches}] {qids_str} ...", end=" ", flush=True)

        try:
            results = call_groq(batch)
        except Exception as e:
            err_str = str(e)
            # 413 = batch too large for TPM cap — fall back to one question at a time
            if "413" in err_str or "rate_limit_exceeded" in err_str:
                print(f"413 — retrying one-by-one ...", end=" ", flush=True)
                results = []
                for solo in batch:
                    time.sleep(20)
                    try:
                        results.extend(call_groq([solo]))
                    except Exception as e2:
                        print(f"\n    SKIP {solo['qid']}: {e2}")
                        errors += 1
            else:
                print(f"ERROR — {e}")
                errors += len(batch)
                time.sleep(CALL_DELAY)
                continue

        converted = {
            r["qid"]: r for r in results
            if isinstance(r, dict) and r.get("qid")
        }

        batch_updated = 0
        for q in batch:
            result = converted.get(q["qid"])
            if not result:
                skipped += 1
                continue

            new_text    = (result.get("text") or "").strip()
            new_options = result.get("options")

            # Normalise options: must be a list of strings or None
            if isinstance(new_options, list) and all(isinstance(o, str) for o in new_options):
                pass
            else:
                new_options = q.get("options")  # keep original if LLM mangled it

            text_changed    = new_text and new_text != q["text"]
            options_changed = new_options != q.get("options")

            if not text_changed and not options_changed:
                skipped += 1
                continue

            if args.dry_run:
                if text_changed:
                    print(f"\n    {q['qid']} text:")
                    print(f"      BEFORE: {q['text'][:110]}")
                    print(f"      AFTER : {new_text[:110]}")
                if options_changed:
                    print(f"\n    {q['qid']} options:")
                    print(f"      BEFORE: {q.get('options')}")
                    print(f"      AFTER : {new_options}")
            else:
                set_fields = {}
                if text_changed:
                    set_fields["text"] = new_text
                if options_changed:
                    set_fields["options"] = new_options
                qs_col.update_one({"qid": q["qid"]}, {"$set": set_fields})

            updated += 1
            batch_updated += 1

        if not args.dry_run:
            print(f"OK  ({batch_updated} updated)")

        if batch_idx < total_batches - 1:
            time.sleep(CALL_DELAY)

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'='*55}")
    print(f"Updated : {updated}")
    print(f"Unchanged: {skipped}")
    print(f"Errors  : {errors}")
    if args.dry_run:
        print("(dry-run — no changes were saved)")
    elif errors == 0:
        print("All done. Questions now use LaTeX notation.")
    else:
        print(f"Completed with {errors} batch error(s). Re-run to retry failed batches.")


if __name__ == "__main__":
    main()
