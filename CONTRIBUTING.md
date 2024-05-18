# Contributing

Feel free to open an issue or create pull request at any time. If you do not know what can be done, here is a list of
ideas in no particular order.

- [ ] Improve testing. Everything besides the login is untested at the moment.
- [ ] Allow continuation from a save file. Helpful for long-running tasks if the account got flagged during the process.
- [ ] Allow to use multiple accounts at the same time to reduce the impact by Instagram's rate limit.
- [ ] Make the tool cloud native ready. The required requests are already in a queue, which could be used for it.
- [ ] Improve error handling. There are a still a few cases where the tool crashes without saving the current state to disk.
- [ ] Improve visualization performance. Currently, [D3.js](https://d3js.org/) is really struggling with large data sets.

## Tests

Tests are written with [Jest](https://jestjs.io/). Run them via

```
npm run test
```

If you want to an IDE like [Webstorm](https://www.jetbrains.com/webstorm/) to run them, make sure to enable
[ECMAScript Module support](https://jestjs.io/docs/ecmascript-modules) by setting `--experimental-vm-modules`.
