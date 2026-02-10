const ServerPluginsInfos = require('./serverPluginsInfos');

console.log('=== Testing ServerPluginsInfos.build() ===\n');

const pluginsInfos = ServerPluginsInfos.build();

console.log('Result of build():');
console.log(JSON.stringify(pluginsInfos, null, 2));

console.log('\n=== Detailed information for each plugin ===\n');

for (const [eventName, pluginInfo] of Object.entries(pluginsInfos)) {
    console.log(`Plugin: ${eventName}`);
    console.log(`  - dirPath: ${pluginInfo.dirPath}`);
    console.log(`  - execPath: ${pluginInfo.execPath || '(empty)'}`);
    console.log(`  - isRemote: ${pluginInfo.isRemote}`);
    console.log(`  - isEnabled: ${pluginInfo.isEnabled}`);
    console.log('');
}
