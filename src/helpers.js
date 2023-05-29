import CoinMarketCap from 'coinmarketcap-api'
import dotenv from 'dotenv'
dotenv.config()

const Q96 = 2**96;

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

function getTickAtSqrtRatio(sqrtPriceX96){
    let tick = Math.floor(Math.log((sqrtPriceX96/Q96)**2)/Math.log(1.0001));
    return tick;
}


export async function getTokenAmountsFromPool(liquidity, sqrtPriceX96, tickLow, tickHigh, Decimal0, Decimal1){
    let sqrtRatioA = Math.sqrt(1.0001**tickLow);
    let sqrtRatioB = Math.sqrt(1.0001**tickHigh);
    
    let currentTick = getTickAtSqrtRatio(sqrtPriceX96);
    let sqrtPrice = sqrtPriceX96 / Q96;
    
    let rawAmount0 = 0;
    let rawAmount1 = 0;
    if(currentTick <= tickLow){
        rawAmount0 = Math.floor(liquidity*((sqrtRatioB-sqrtRatioA)/(sqrtRatioA*sqrtRatioB)));
    }
    else if(currentTick > tickHigh){
        rawAmount1 = Math.floor(liquidity*(sqrtRatioB-sqrtRatioA));
    }
    else if(currentTick >= tickLow && currentTick < tickHigh){ 
        rawAmount0 = Math.floor(liquidity*((sqrtRatioB-sqrtPrice)/(sqrtPrice*sqrtRatioB)));
        rawAmount1 = Math.floor(liquidity*(sqrtPrice-sqrtRatioA));
    }
    
    let amount0 = (Math.abs(rawAmount0/(10**Decimal0))).toFixed(Decimal0);
    let amount1 = (Math.abs(rawAmount1/(10**Decimal1))).toFixed(Decimal1);

    console.log("Amount Token0 wei: "+rawAmount0);
    console.log("Amount Token1 wei: "+rawAmount1);
    console.log("Amount Token0 : "+amount0);
    console.log("Amount Token1 : "+amount1);
    return {rawAmount0, rawAmount1, amount0, amount1}
}

/**
 * Случайное min/max целое значение
 * @param {Integer} min 
 * @param {Integer} max 
 * @returns Случайное число
 */

export const randomIntInRange = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Абстрактная задержка (async)
 * @param {Integer} millis 
 * @returns
 */
export const sleep = async (millis) => new Promise(resolve => setTimeout(resolve, millis));