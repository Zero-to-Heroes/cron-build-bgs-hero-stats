# Reference

Used this project as template: https://github.com/alukach/aws-sam-typescript-boilerplate

# Random notes for Quests

what do we want to get?

-   average turns to complete for given hero / tribes (and current MMR bracket)
-   how much the current hero influences the turns to complete (i.e. delta vs average of heroes)
-   how much the current tribes influence the turns to complete (i.e. delta vs all tribes). Maybe also highlight the tribes that have the best influence, as these are probably tribes you should focus on? Maybe this is too obvious?

stat: {
globalData;
difficulty: <difficult, globalDataForDifficulty, difficultyImpact>
heroes: <hero, globalDataForHero>
tribes: <tribe, globalDataForTribe, raceAverageTurnToCompleteImpact, raceCompletionRateImpact>
}

in game: - for each quest - extract quest + difficulty - get turnsToComplete + completionRate for hero - get raceImpact for turnsToComplete + completionRate for each tribe - get difficultyImpact for tTC + cR for the difficulty. - this will tell me that "on average, difficulty 4 is + 0.5 ttc vs average difficulty) - build average turn to complete for hero + tribes (using the race impacts) + difficulty (using the average delta for difficulty. That way we can use the global average for the hero, and use the difficulty delta to update this data. The assumption behind this is that the difficulty impact all heroes the same way, which a priori seems fair, since the difficulty is just a quota to get)

globalData: averageTurnToComplete (when completed), completionRate

```

```
