import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import HtmlInlineScriptPlugin from 'html-inline-script-webpack-plugin'
import HTMLInlineCSSWebpackPlugin from 'html-inline-css-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import {fileURLToPath} from 'url'
import {dirname} from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const config = {
    entry: './src/visualization/index.ts',
    devtool: 'source-map',
    output: {
        path: path.resolve(__dirname, 'dist'),
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: "[name].css",
            chunkFilename: "[id].css",
        }),
        new HtmlWebpackPlugin({
            template: '/src/visualization/index.html',
        }),
        new HtmlInlineScriptPlugin(),
        new HTMLInlineCSSWebpackPlugin.default()
    ],
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/i,
                loader: 'ts-loader',
                exclude: ['/node_modules/', '/test/'],
                options: {
                    configFile: 'webpack.tsconfig.json'
                }
            },
            {
                test: /\.css$/,
                use: [
                    {
                        loader: MiniCssExtractPlugin.loader,
                        options: {
                            publicPath: ''
                        }
                    },
                    "css-loader"
                ]
            },
            {
                test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif)$/i,
                type: 'asset',
            }
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.jsx', '.js', '...'],
    },
};

export default () => {
    if (process.env.NODE_ENV === 'production') {
        config.mode = 'production';
    } else {
        config.mode = 'development';
    }
    return config;
};
