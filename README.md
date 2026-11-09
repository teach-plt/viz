# LR parser visualization

[shift-red](shift-red.html): The shift-red browser game for simulating a shift-reduce parser.

[shift-red2](shift-red2.html): A compact variant with the LBNF editor directly
beside the parsing history. Edit parser input in the first Stack · Input row.
When the grammar editor loses focus, available reductions appear in bold red
and unavailable rules are half-greyed out.
Edits replay the existing actions; incompatible actions show ERROR. SAVE
preserves the grammar, input, actions, and undo history as a URL.
Resize the playing area using its lower-right corner. Drag the vertical divider
to change the grammar/parser width ratio, or focus it and use Left/Right arrows.

[lr-gen](lr-gen.html): Build an LR(0) automaton and its parse table interactively.

## Grammar format: LBNF

The grammar is expected in Labelled Backus Naur Form [LBNF]() as understood by the BNFC tool,
although not all BNFC pragmas are recognized.
It supports labelled LBNF productions, empty productions, comments, list categories, and the built-in
`Ident`, `Integer`, `Double`, `String`, and `Char` terminals. LBNF macros and
custom token declarations must be expanded into labelled productions first.

The first production determines the start category (or use an `entrypoints` declaration).
