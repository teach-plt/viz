# LR parser visualization

[shift-red](shift-red.html): The shift-red browser game for simulating a shift-reduce parser.

[lr-gen](lr-gen.html): Build an LR(0) automaton and its parse table interactively.

Open either HTML file directly in a browser. No build or server is required.

In **lr-gen**, press Enter or Down to confirm the suggested step, Up to undo,
and Left/Right to cycle available actions. Type a prefix to filter suggestions,
or click an earlier step to revisit it. Undone steps and their graph/table
entries remain grey until you choose a different action. SAVE creates a URL
containing the grammar and only the confirmed steps.

Edit the grammar and return to Steps to start a fresh construction. The first
production determines the start category (or use an `entrypoints` declaration).
The page adds its own start production and EOF token. It supports labelled LBNF
productions, empty productions, comments, list categories, and the built-in
`Ident`, `Integer`, `Double`, `String`, and `Char` terminals. LBNF macros and
custom token declarations must be expanded into labelled productions first.

The graph uses the locally vendored [Cytoscape.js](https://js.cytoscape.org/)
3.33.1 (MIT; see [its license](vendor/cytoscape.LICENSE)). CoSE animates from
existing positions; undo alone does not rerun the layout. Drag nodes, pan/zoom,
use FIT to see the whole graph, or turn motion off.

Run the LR construction checks with `node --test tests/lr-gen.test.cjs`.
