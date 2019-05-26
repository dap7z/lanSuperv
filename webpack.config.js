const path = require('path');

module.exports = {
	mode: 'development', //for non-minified output
    entry: './web/src/js/index.js',
    output: {
        path: path.resolve(__dirname + '/web/dist'),
        filename: 'bundle.js',
    },
    node: {
        __dirname: false,
        __filename: false
    },
    resolve: {
        alias: {
            'vue$': 'vue/dist/vue.esm.js'
        },
        extensions: ['*', '.js', '.vue', '.json']
    },
    module: {
        rules: [
            {
                test: /\.vue$/,
                loader: 'vue-loader'
            }
        ]
    }
};