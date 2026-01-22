/* Execution :
*  -> npm run build
*  -> npm run dev //for non-minified
*/

const path = require('path');

module.exports = {
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
            'vue$': 'vue/dist/vue.esm-bundler.js'
        },
        extensions: ['.js', '.vue', '.json']
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    }
};