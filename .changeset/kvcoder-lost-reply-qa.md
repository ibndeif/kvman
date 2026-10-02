---
'@kvman/kvcoder': minor
---

A reply the provider lost on the way (a tool call that never arrived, found by replaying a real model) no longer ends the turn silently: kvcoder tells the model so and runs another step, twice at most, then ends with a clear `REPLY_LOST` notice. A call that arrives without an id gets one and one without a name is dropped, so a broken call can't make every later request fail. `fs write` and `artifact write` take their content as the raw heredoc body (`fs write '{"path":"index.html"}'` then the file), which models deliver reliably where JSON-escaped file content was often lost.
