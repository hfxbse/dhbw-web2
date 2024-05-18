# Insta(nt)-Graph

A tool to create a visual representation how accounts are following each other on [Instagram](https://instagram.com).

![An example of the visual representation](./example-graph.png)

**NOTE: THIS TOOL IS NOT ASSOCIATED OR ENDORSED BY INSTAGRAM OR META. USE AT YOUR OWN RISK.**

## Usage

Make sure [Node.js >= v20.x](https://nodejs.org/) is installed on your system.

Download or clone this repository to your maschine. Then install the project dependencies via

```
npm install
```

To compile and run the program use

```
npm run cli
```

The result will be stored in a JSON-file. Additionally, an interactive visualization is generated as single HTML-file, 
which can be viewed in any modern Browser. The tool will stop early if it receives an `SIGINT`-Signal (when pressing
`CTRL+C` for example) and create the output for the current state.

### Options

| Name                   | Description                                                                                                                                                              | Default value |
|------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| Session ID             | The session ID used by Instagram to authenticate the user. Can be attained either by login in via the tool or through the data stored by the official Instagram web-app. |
| Root account           | The account from which the graph generation should start from.                                                                                                           |               |
| Generations            | The distance between the root account and the current user, defined by the number of accounts between. Generation 0 therefor only includes the root account.             | 1             |
| Maximal follower count | Maximal amount of followers to fetch for each account. If more followers are over-fetched, they will be included but not further queried. Also applies to following.     | 250           |
| Include following      | Also fetch the accounts are followed by an account, not only their followers.                                                                                            | Yes           |

### Handling of errors and Instagram's rate limits

To not be flagged as automated behaviour, the tool needs to pause for a while after retrieving a lot of followers. The
tool will output the current state in the meanwhile. 

Also, if an error occurs, the tool will try to output the current state. This might fail if the error was unhandled. 

### Running the tool on a VPS

If you wish to run this tool on a VPS due to its long-running nature, you may cannot use the login functionality of this
tool as captchas are not handled.

Another issue you might run to is Node.js running out of memory if your VPS does not have an adequate amount of RAM. To 
work around this, you enable SWAP within your VPS and explicitly allow Node.js to use more memory via 
[`--max-old-space-size`](https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-megabytes).

## Contribute

Feel free to open an issue or create pull request at any time. If you do not know what can be done, here is a list of
ideas in no particular order.

- [ ] Improve testing. Everything besides the login is untested at the moment.
- [ ] Allow continuation from a save file. Helpful for long-running tasks if the account got flagged during the process.
- [ ] Allow to use multiple accounts at the same time to reduce the impact by Instagram's rate limit.
- [ ] Make the tool cloud native ready. The required requests are already in a queue, which could be used for it.
- [ ] Improve error handling. There are a still a few cases where the tool crashes without saving the current state to disk.
- [ ] Improve visualization performance. Currently, [D3.js](https://d3js.org/) is really struggling with large data sets.

### Tests

Tests are written with [Jest](https://jestjs.io/). Run them via

```
npm run test
```

If you want to an IDE like [Webstorm](https://www.jetbrains.com/webstorm/) to run them, make sure to enable
[ECMAScript Module support](https://jestjs.io/docs/ecmascript-modules) by setting `--experimental-vm-modules`.
