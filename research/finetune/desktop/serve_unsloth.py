"""Serve a trained Unsloth decision model on the same POST /v1/systemone API as Kev and d3, so the sim's eval
suite, counterfactual pairs and world experiment can score it unchanged.

    python serve_unsloth.py runs/<name>/model [--port 8010]

Response shape (what packages/worker/src/kev.ts reads): {"answers": {q: {"type", "probabilities", ...}}, "usage", "latency_ms"}.
choice/score: probabilities keyed by option key / score position; noul: {"noul": p(true)}.
"""
import json, sys, time, warnings, argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

warnings.filterwarnings("ignore")
from unsloth import FastDecisionModel  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("model_dir")
ap.add_argument("--port", type=int, default=8010)
ap.add_argument("--host", default="0.0.0.0")
args = ap.parse_args()

model, tokenizer = FastDecisionModel.from_pretrained(args.model_dir, load_in_4bit=True)
FastDecisionModel.for_inference(model)
lock = Lock()   # one GPU, one request at a time
print(f"serving {args.model_dir} on http://{args.host}:{args.port}/v1/systemone", flush=True)


def to_api(questions, answers):
    out = {}
    for name, q in questions.items():
        a = answers.get(name, {})
        probs = {str(k): float(v) for k, v in (a.get("probabilities") or {}).items()}
        if q.get("type") == "noul":
            p_true = probs.get("true", 1.0 if a.get("answer") is True else 0.0)
            out[name] = {"type": "noul", "noul": p_true}
        else:
            out[name] = {"type": q.get("type"), "probabilities": probs, "choice": str(a.get("answer"))}
    return out


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet
        pass

    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/v1/models"):
            return self._send(200, {"models": [{"name": "trained", "run": args.model_dir}]})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if not self.path.startswith("/v1/systemone"):
            return self._send(404, {"error": "not found"})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))))
            t0 = time.time()
            with lock:
                answers = FastDecisionModel.predict(model, tokenizer, req["state"], req["questions"])
            self._send(200, {"model": req.get("model", "trained"), "answers": to_api(req["questions"], answers),
                             "usage": {"input_tokens": 0}, "latency_ms": round((time.time() - t0) * 1000, 1)})
        except Exception as e:  # report, keep serving
            self._send(500, {"error": f"{type(e).__name__}: {e}"})


ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()
