const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
const defaults = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaults) ? defaults : defaults ? [defaults] : []),
  /(?:^|[/\\])backups(?:[/\\]|$)/,
  /(?:^|[/\\])KD-Taxi[^/\\]*-BK[^/\\]*(?:[/\\]|$)/,
  /\.(?:bak|logout-bak|tmp)$/,
];
module.exports = config;
