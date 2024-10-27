Minion stats: 
	- warband impact 
	- consider minions added to warband on turn T, and that are there at T+1 (so excludes the ones that have been cycled) 
	- pounder that by hero's average position to get an "impact" 
	- build a file that is global for all minions, and has stats for each hero

- play impact
  - count minions that have been played on turn T, and correlate that with average position (play impact)
- buy rate
  - how often is a given minion bought when offered?
- could also correlate that with minions on the warband?
  - for each "played" minion, also split by warband minion
  - so you'd have a (turn, warband_minion, played_minion, final_position) tuple
  - then, from the actual warband, you could get the play impact of each minion in the shop.
    - How to ponderate the different values? Keep only the "best" ones? If you have a cycle card, it shouldn't drag down the play impact of a given minion
    - sum the impacts? This could make sense in a way, as cards could compound
    - but on the other hand, that would probably count some cards multiple times (eg if you have Kalecgos + a divine shield dragon on the board, getting a battlecry minion is really all about that kalecgos)
    - use the max impact? This could probably make sense as well, as it's usually one or two cards that act as the main reason for a card to be played
- buy rate
	- could probably use the same logic as above

First step:
- store the cards played by turn 