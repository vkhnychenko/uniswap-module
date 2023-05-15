import CoinMarketCap from 'coinmarketcap-api'
import dotenv from 'dotenv'
dotenv.config()

const client = new CoinMarketCap(process.env.COINMARKET_API_KEY)

export async function getPrices(tickers){
    try{
        const query = {symbol: tickers}
        const res = await client.getQuotes(query)
        let prices = {}
        for (let ticker of tickers.split(',')){
            prices[`${ticker}`] = res.data[`${ticker}`].quote.USD.price;
        }

        return prices
    } catch {
        console.error
    } 
}