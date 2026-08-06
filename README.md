# SHOTPlan Web

A faithful web rebuild of **SHOTPlan v3.0**, the DOS blast design and
initiation-timing package published by ICI Explosives in 1993.

Not a modernisation. The goal is the original program — its screen layout, its
key bindings, its terminology, and its calculation behaviour including the
quirks — running in a browser.

## Why bother

SHOTPlan did something most modern blast design tools quietly stopped doing: it
treated detonator timing as a **distribution rather than a number**. Every
delay carries a nominal, a mean and scatter, and the program runs the
distribution. That is what lets it answer questions like *"what is the
probability these two adjacent holes fire out of sequence?"* — a question that
matters on a real bench and that a deterministic timing model cannot answer at
all.

Rebuilding it is partly preservation and partly the observation that a 1993 DOS
program was, on this specific point, ahead of a good deal of what replaced it.

## Scope

Reimplementation of the original's **functionality and interface conventions**,
built from documented facts about observed behaviour and file layout. No
translated code, no extracted assets. The original binaries are not in this
repository and will not be.

## Status

Early. Reverse engineering of the original is in progress; the on-disk formats
are being documented before any application code is written.

| Area | State |
|---|---|
| Menu tree and display toggles | Recovered |
| Internal data model | Recovered |
| Calculation inventory and outputs | Recovered |
| `.XEL` plan file format | Not yet decoded |
| Delay / product / reliability tables | Not yet decoded |
| Timing and probability model | Not yet characterised |
| Application code | Not started |

## Legal position

IES Pty Ltd, the original developer, no longer trades. ICI Explosives was sold
to Orica in 1998; ICI was absorbed by AkzoNobel in 2008. Copyright did not lapse
with any of that, which is precisely why this is a clean-room reimplementation
and not a port.

This project is not affiliated with or endorsed by any of the above.
