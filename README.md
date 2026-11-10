# LR parser visualization

[shift-red](shift-red.html): The shift-red browser game for simulating a shift-reduce parser.

[shift-red2](shift-red2.html): A compact variant with the LBNF editor directly
beside the parsing history. Edit parser input in the first Stack · Input row.

[table-parse](table-parse.html): Run shift-reduce parsing with a computed LR(0) parse table.

[lr-gen](lr-gen.html): Build an LR(0) automaton and its parse table interactively.

## Grammar format: LBNF

The grammar is expected in Labelled Backus Naur Form [LBNF]() as understood by the BNFC tool,
although not all BNFC pragmas are recognized.
It supports labelled LBNF productions, empty productions, comments, list categories, and the built-in
`Ident`, `Integer`, `Double`, `String`, and `Char` terminals. LBNF macros and
custom token declarations must be expanded into labelled productions first.

The first production determines the start category (or use an `entrypoints` declaration).

## Example LR(0) grammar 0

```
R. E ::= E "-" Integer;
E. E ::= Integer;
```
Input:
```
3 - 2 - 1
```

- [shift-red2](https://teach-plt.github.io/viz/shift-red2.html?grammar=R.+E+%3A%3A%3D+E+%22-%22+Integer%3B%0AE.+E+%3A%3A%3D+Integer%3B&input=3+-+2+-+1&played=&user-input=)
- [table-parse](https://teach-plt.github.io/viz/table-parse.html?grammar=R.+E+%3A%3A%3D+E+%22-%22+Integer%3B%0AE.+E+%3A%3A%3D+Integer%3B&input=3+-+2+-+1&played=%5B%5D&user-input=%5B%5D&focus=0)
- [lr-gen](https://teach-plt.github.io/viz/lr-gen.html?grammar=R.+E+%3A%3A%3D+E+%22-%22+Integer%3B%0AE.+E+%3A%3A%3D+Integer%3B&steps=%5B%5D&tooltips=on)

## Example LR(0) grammar 1

```
S. E ::= E "-" T;
E. E ::= T;
T. T ::= Integer;
```
Input:
```
3 - 2 - 1
```

- [lr-gen](https://teach-plt.github.io/viz/lr-gen.html?grammar=S.+E+%3A%3A%3D+E+%22-%22+T%3B%0AE.+E+%3A%3A%3D+T%3B%0AT.+T+%3A%3A%3D+Integer%3B&steps=%5B%5D&tooltips=on)

## Example LR(0) grammar 2

```
S. E ::= E "-" T;
E. E ::= T;
T. T ::= Integer;
P. T ::= "(" E ")";
```
Input:
```
3 - 2 - 1
```

- [shift-red2](https://teach-plt.github.io/viz/shift-red2.html?grammar=S.+E+%3A%3A%3D+E+%22-%22+T%3B%0AE.+E+%3A%3A%3D+T%3B%0AT.+T+%3A%3A%3D+Integer%3B%0AP.+T+%3A%3A%3D+%22%28%22+E+%22%29%22%3B&input=3+-+2+-+1&played=&user-input=)
- [table-parse](https://teach-plt.github.io/viz/table-parse.html?grammar=S.+E+%3A%3A%3D+E+%22-%22+T%3B%0AE.+E+%3A%3A%3D+T%3B%0AT.+T+%3A%3A%3D+Integer%3B%0AP.+T+%3A%3A%3D+%22%28%22+E+%22%29%22%3B&input=3+-+2+-+1&played=%5B%5D&user-input=%5B%5D&focus=0)
- [lr-gen](https://teach-plt.github.io/viz/lr-gen.html?grammar=S.+E+%3A%3A%3D+E+%22-%22+T%3B%0AE.+E+%3A%3A%3D+T%3B%0AT.+T+%3A%3A%3D+Integer%3B%0AP.+T+%3A%3A%3D+%22%28%22+E+%22%29%22%3B&steps=%5B%5D&tooltips=on)

## Example LR(1) grammar

This grammar, adapted from the Implementing Programming Languages book, Section 3.7, p.51,
is LR(1) but not LR(0).
```
A. E ::= E "+" T;
E. E ::= T;
M. T ::= T "*" Integer;
T. T ::= Integer;
```
Input:
```
1 + 2 * 3
```

- [shift-red2](https://teach-plt.github.io/viz/shift-red2.html?grammar=A.+E+%3A%3A%3D+E+%22%2B%22+T%3B%0AE.+E+%3A%3A%3D+T%3B%0AM.+T+%3A%3A%3D+T+%22*%22+Integer%3B%0AT.+T+%3A%3A%3D+Integer%3B&input=1+%2B+2+*+3&played=&user-input=)
- [table-parse](https://teach-plt.github.io/viz/table-parse.html?grammar=A.+E+%3A%3A%3D+E+%22%2B%22+T%3B%0AE.+E+%3A%3A%3D+T%3B%0AM.+T+%3A%3A%3D+T+%22*%22+Integer%3B%0AT.+T+%3A%3A%3D+Integer%3B%0A&input=1+%2B+2+*+3&played=%5B%5D&user-input=%5B%5D&focus=0)
- [lr-gen](https://teach-plt.github.io/viz/lr-gen.html?grammar=A.+E+%3A%3A%3D+E+%22%2B%22+T%3B%0AE.+E+%3A%3A%3D+T%3B%0AM.+T+%3A%3A%3D+T+%22*%22+Integer%3B%0AT.+T+%3A%3A%3D+Integer%3B&steps=%5B%5D&tooltips=on)

## Example ambiguous grammar

```
S. E ::= E "-" E;
E. E ::= Integer;
```
Input:
```
3 - 2 - 1
```

- [shift-red2](https://teach-plt.github.io/viz/shift-red2.html?grammar=S.+E+%3A%3A%3D+E+%22-%22+E%3B%0AE.+E+%3A%3A%3D+Integer%3B&input=3+-+2+-+1&played=&user-input=)
- [table-parse](https://teach-plt.github.io/viz/table-parse.html?grammar=S.+E+%3A%3A%3D+E+%22-%22+E%3B%0AE.+E+%3A%3A%3D+Integer%3B&input=3+-+2+-+1&played=%5B%5D&user-input=%5B%5D&focus=0)
- [lr-gen](https://teach-plt.github.io/viz/lr-gen.html?grammar=S.+E+%3A%3A%3D+E+%22-%22+E%3B%0AE.+E+%3A%3A%3D+Integer%3B&steps=%5B%5D&tooltips=on)
