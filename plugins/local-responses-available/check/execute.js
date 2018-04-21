const PluginName = 'check';

process.on('message', (pcTarget) => {
	process.send('start');
    try {
        process.send('TODO: CHECK AS PLUGIN');

    } catch (e) {
        console.warn('Catched error on '+PluginName, macAddr, e);
        process.send('fail');
    }
});