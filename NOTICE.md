# NOTICE

## Noto Emoji silhouettes

`motifs-noto.js` contains 29 silhouettes adapted from the **Noto Emoji** project.

```
Copyright 2013 Google, Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
```

Source: <https://github.com/googlefonts/noto-emoji>, directory `2D/svg`, which carries that licence
file. Read at the source on 2026-09-22 — not assumed.

**What we changed, stated plainly:** each emoji was flattened to a single-colour silhouette,
re-centred, scaled to this project's drawing space, and its coordinates rounded to one decimal.
The colour is then set at render time from the creator's own accent colour, which is why a
multi-colour original could not be kept as-is.

**What does not go on chain:** a block engraves the *name* of its face (`{"facette":"licorne"}`),
never the artwork. No licensed byte is written to Base.

Twenty of the fifty emoji first imported were dropped after looking at them: flattened to one
colour, the face emoji all render as the same disc, because what distinguishes them is inside, in
colour. A silhouette only carries meaning when the shape carries it.

## Everything else

Every other drawing in this repository — 93 face motifs, the cube, the orbits, the ornaments — is
traced by hand in SVG in `logo.js`, with no imported asset. That is deliberate: a block's face is
**engraved and irreversible**, so a licence read wrongly would be the one mistake that cannot be
undone.
