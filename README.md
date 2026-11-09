# LR parser visualization

[shift-red](shift-red.html): The shift-red browser game for simulating a shift-reduce parser.

[lr-gen](lr-gen.html): Build an LR(0) automaton and its parse table interactively.

## Grammar format: LBNF

The grammar is expected in Labelled Backus Naur Form [LBNF]() as understood by the BNFC tool,
although not all BNFC pragmas are recognized.
It supports labelled LBNF productions, empty productions, comments, list categories, and the built-in
`Ident`, `Integer`, `Double`, `String`, and `Char` terminals. LBNF macros and
custom token declarations must be expanded into labelled productions first.

The first production determines the start category (or use an `entrypoints` declaration).
