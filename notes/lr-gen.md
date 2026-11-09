LR-gen
======


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
3.33.1 (MIT; see [its license](vendor/cytoscape.LICENSE)) and locally vendored
[ELK.js](https://github.com/kieler/elkjs) 0.11.0 for layout (EPL 2.0;
see [its license and source notice](vendor/elk.NOTICE.md)). Keep the HTML,
JavaScript files, and `vendor/` directory together when copying the tool.

When a grammar is applied, the tool computes its complete canonical LR(0)
automaton separately from the teaching steps. ELK compares compact downward,
wrapped, and rightward layouts against the display's aspect ratio. The selected
layout reserves space for every state's closure and every labelled edge.
The initial view fits this complete plan; confirming steps reveals states at
their planned positions, with the numbers assigned by the user's action order.
Unvisited states remain hidden. Undo and branching do not rerun layout or move
existing nodes. Manual positions are retained by item-set identity; dragging a
node only adjusts its incident edge routes.

Layout planning uses a background worker over HTTP(S). Direct local-file URLs
also work, using the bundled in-process engine when external workers are
unavailable. Changing the grammar cancels obsolete planning results. Resizing
the window does not rearrange the diagram; FIT refits the plan to the new size.
Large automata can still require pan/zoom to read comfortably.

Help and action explanations appear on hover. The TOOLTIPS button switches all
tooltips on or off; the URL parameter `tooltips=off` disables them on load
(default: on). SAVE includes that setting. The parse table can be resized
vertically using its lower-right corner.

Run the LR construction checks with `node --test tests/lr-gen.test.cjs`.
