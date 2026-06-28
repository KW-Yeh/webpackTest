const path = require('path');
const fs = require('fs');

// plugin
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const env = (process.env.NODE_ENV || "development");
const manifestPath = path.resolve(__dirname, 'manifest.json');

class ManifestPlugin {
    apply(compiler) {
        compiler.hooks.thisCompilation.tap('ManifestPlugin', (compilation) => {
            compilation.hooks.processAssets.tap(
                {
                    name: 'ManifestPlugin',
                    stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
                },
                () => {
                    const manifest = fs.readFileSync(manifestPath);
                    compilation.emitAsset('manifest.json', new compiler.webpack.sources.RawSource(manifest));
                }
            );
        });
    }
}

module.exports = {
    mode: 'development',
    entry: './src/index.jsx',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'static/js/main.js'
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx)?$/,
                exclude: /node_modules/,
                use: [{
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            "@babel/preset-env",
                            "@babel/preset-react"
                        ],
                    }
                }]
            },
            {
                test: /\.(sa|sc|c)ss$/,
                use: [
                    env === "development" ? 'style-loader' : MiniCssExtractPlugin.loader,
                    'css-loader',
                    'sass-loader'
                ],
            },
        ]
    },
    devServer: {
        historyApiFallback: true
    },
    optimization: {
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    output: {
                        comments: false
                    }
                },
                extractComments: false
            })
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
        }),
        new ManifestPlugin(),
    ],
};
