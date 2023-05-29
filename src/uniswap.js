import { ethers } from "ethers"
import moment from 'moment'
import { Token, Percent, CurrencyAmount, TradeType, Fraction } from '@uniswap/sdk-core'
import { getPrices } from "./helpers.js";
import {writeSheet} from './sheets.js'
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert { type: "json" }
import { nearestUsableTick, NonfungiblePositionManager, Pool, Position, computePoolAddress, FeeAmount } from '@uniswap/v3-sdk'
import {AlphaRouter, SwapType, SwapToRatioStatus} from '@uniswap/smart-order-router'
import { ERC20_ABI, NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS, NONFUNGIBLE_POSITION_MANAGER_ABI, V3_SWAP_ROUTER_ADDRESS_02, POOL_FACTORY_CONTRACT_ADDRESS } from '../constants.js'
import {logger, TICK_UPPER_MULTIPLIER, TICK_LOWER_MULTIPLIER, MIN_SUM_BALANCE,
    MIN_BALANCE_TOKEN0, MIN_BALANCE_TOKEN1, DEFAULT_GAS_LIMIT, CHAIN_NAME, MIN_DIFFERENCE_SUM, MIN_BALANCE_TOKEN0_FOR_MINT, MIN_BALANCE_TOKEN1_FOR_MINT, RETRY_COUNT_SWAP_AND_ADD_LIQUIDITY} from '../config.js'
import { Connection } from "./provider.js";
import { sendMessageToTelegram } from "./telegramBot.js";
import { getTokenAmountsFromPool, sleep, randomIntInRange } from "./helpers.js";
import dotenv from 'dotenv'
dotenv.config()

export class Uniswap {
    constructor(token0, token1, fee) {
        this.token0 = token0;
        this.token1 = token1;
        this.fee = fee
        this.gasLimit = DEFAULT_GAS_LIMIT
        this.tickUpperMultiplier = TICK_UPPER_MULTIPLIER
        this.tickLowerMultiplier = TICK_LOWER_MULTIPLIER
        this.swapRouterAddress = V3_SWAP_ROUTER_ADDRESS_02
        this.connection = new Connection(CHAIN_NAME, process.env.WALLET_PRIVATE_KEY)
    }

    async getPoolInfo(){
        const currentPoolAddress = computePoolAddress({
            factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
            tokenA: this.token0,
            tokenB: this.token1,
            fee: this.fee,
        })

        const poolContract = new ethers.Contract(
            currentPoolAddress,
            IUniswapV3PoolABI.abi,
            this.connection.provider
        )

        const [token0, token1, fee, tickSpacing, liquidity, slot0, feeGrowthGlobal0X128, feeGrowthGlobal1X128] =
            await Promise.all([
                poolContract.token0(),
                poolContract.token1(),
                poolContract.fee(),
                poolContract.tickSpacing(),
                poolContract.liquidity(),
                poolContract.slot0(),
                poolContract.feeGrowthGlobal0X128(),
                poolContract.feeGrowthGlobal1X128()
            ])

        return {token0, token1, fee, tickSpacing, liquidity, sqrtPriceX96: slot0.sqrtPriceX96.toString(), tick: slot0[1], feeGrowthGlobal0X128, feeGrowthGlobal1X128}
    }

    async getTickInfoFromPool(tick){
        const currentPoolAddress = computePoolAddress({
            factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
            tokenA: this.token0,
            tokenB: this.token1,
            fee: this.fee,
        })

        const poolContract = new ethers.Contract(
            currentPoolAddress,
            IUniswapV3PoolABI.abi,
            this.connection.provider
        )

        const info = await poolContract.ticks(tick)
        return {feeGrowthOutside0X128: info[2], feeGrowthOutside1X128: info[3]}
    }

    async checkRewards(positionId){
        const {feeGrowthGlobal0X128, feeGrowthGlobal1X128} = await this.getPoolInfo()
        const positionInfo = await this.getPositionInfo(positionId)

        const {feeGrowthOutside0X128: feeGrowthOutside0X128_lower, feeGrowthOutside1X128: feeGrowthOutside1X128_lower} = await this.getTickInfoFromPool(positionInfo.tickLower)
        const {feeGrowthOutside0X128: feeGrowthOutside0X128_upper, feeGrowthOutside1X128: feeGrowthOutside1X128_upper} = await this.getTickInfoFromPool(positionInfo.tickUpper)

        const feeToken0 = ((feeGrowthGlobal0X128 - feeGrowthOutside0X128_lower - feeGrowthOutside0X128_upper - positionInfo.feeGrowthInside0LastX128)/(2**128))*positionInfo.liquidity/(1*10**this.token0.decimals)
        const feeToken1 = ((feeGrowthGlobal1X128 - feeGrowthOutside1X128_lower - feeGrowthOutside1X128_upper - positionInfo.feeGrowthInside1LastX128)/(2**128))*positionInfo.liquidity/(1*10**this.token1.decimals)
        logger.info(`feeToken0: ${feeToken0}, feeToken1: ${feeToken1}`)

        await sendMessageToTelegram(`Накопленное вознаграждение для кошелька: ${this.connection.wallet.address}\nНомер позиции: ${positionId}\nToken0: ${this.token0.name} - награда: ${feeToken0}\nToken1: ${this.token1.name} - награда: ${feeToken1}`)

        const currentDate = moment().format('DD.MM.YYYY');
        const data = [currentDate, this.connection.wallet.address, this.token0.name, feeToken0, this.token1.name, feeToken1]
        logger.info(`data for write sheets: ${data}`)
        await writeSheet('Rewards', data)

        return {feeToken0, feeToken1}
    }

    async getPositionInfo(positionId){
        const positionContract = new ethers.Contract(
            NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
            NONFUNGIBLE_POSITION_MANAGER_ABI,
            this.connection.provider
        )

        const position = await positionContract.positions(positionId)


        return {
            tickLower: position.tickLower,
            tickUpper: position.tickUpper,
            liquidity: position.liquidity.toString(),
            fee: position.fee,
            feeGrowthInside0LastX128: position.feeGrowthInside0LastX128.toString(),
            feeGrowthInside1LastX128: position.feeGrowthInside1LastX128.toString(),
            token0: position.token0,
            token1: position.token1,
            tokensOwed0: position.tokensOwed0.toString(),
            tokensOwed1: position.tokensOwed1.toString(),
        }
    }
    
    async getPositionIds(address){
        const positionContract = new ethers.Contract(
            NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
            NONFUNGIBLE_POSITION_MANAGER_ABI,
            this.connection.provider
        )
    
        // Get number of positions
        const balance = await positionContract.balanceOf(address)
    
        // Get all positions
        const tokenIds = []
        for (let i = 0; i < balance; i++) {
            const tokenOfOwnerByIndex = await positionContract.tokenOfOwnerByIndex(address, i)
            tokenIds.push(tokenOfOwnerByIndex.toString())
        }
    
        return tokenIds
    }

    async getTokenBalances(){
        const token0Contract = new ethers.Contract(this.token0.address, ERC20_ABI, this.connection.provider)
        const token1Contract = new ethers.Contract(this.token1.address, ERC20_ABI, this.connection.provider)

        const rawBalance0 = await token0Contract.balanceOf(this.connection.wallet.address)
        const balance0 = ethers.utils.formatUnits(rawBalance0, this.token0.decimals)
        
        const rawBalance1 = await token1Contract.balanceOf(this.connection.wallet.address)
        const balance1 = ethers.utils.formatUnits(rawBalance1, this.token1.decimals)
        logger.info(`balance0: ${balance0}, balance1: ${balance1}`)

        return {rawBalance0, balance0, rawBalance1, balance1}
    }

    async getTokenPrices(){
        const prices = await getPrices(`${this.token0.name},${this.token1.name}`)
        logger.info(`price0: ${prices[`${this.token0.name}`]}, price1: ${prices[`${this.token1.name}`]}`)

        return {price0: prices[`${this.token0.name}`], price1: prices[`${this.token1.name}`]}
    }

    async checkApproval({token, spender, rawAmount}){
        logger.info(`token transfer approval for: ${token.symbol}`)
        const tokenContract = new ethers.Contract(token.address, ERC20_ABI, this.connection.wallet)

        const rawAllowance = await tokenContract.allowance(this.connection.wallet.address, spender)
        const allowance = ethers.utils.formatUnits(rawAllowance, token.decimals)
        const amount = ethers.utils.formatUnits(rawAmount, token.decimals) 

        logger.info(`allowance: ${+allowance} - amount: ${+amount}` )

        if (+allowance >= +amount){
            logger.info(`dont need allowance for: ${token.symbol}`)
            return true
        }

        const gasEstimated = await tokenContract.estimateGas.approve(spender, rawAmount);
        console.log('gasEstimated for allowance', +gasEstimated)

        const txInfo = {
            value: 0,
            gasLimit: gasEstimated
        }

        const status = await this.connection.sendTransaction({chainName: CHAIN_NAME, method: tokenContract.approve, params: [spender, rawAmount], txInfo})

        if (status != 1){
            return false
        }

        return true
    }

    async constructNewPosition(token0, token1, amount0, amount1) {
        const poolInfo = await this.getPoolInfo()
        
        const configuredPool = new Pool(
            token0,
            token1,
            poolInfo.fee,
            poolInfo.sqrtPriceX96,
            poolInfo.liquidity.toString(),
            poolInfo.tick
        )
    
        // const tokenPrice1 = configuredPool.token0Price.toSignificant(10);
        // const tokenPrice2 = configuredPool.token1Price.toSignificant(10);
    
    //   create position using the maximum liquidity from input amounts
        const tickUpper = nearestUsableTick(poolInfo.tick, poolInfo.tickSpacing) + poolInfo.tickSpacing * this.tickUpperMultiplier
        const tickLower = nearestUsableTick(poolInfo.tick, poolInfo.tickSpacing) - poolInfo.tickSpacing * this.tickLowerMultiplier

        return Position.fromAmounts({
            pool: configuredPool,
            tickLower,
            tickUpper,
            amount0,
            amount1,
            useFullPrecision: true,
        })
    }

    async constructPositionWithPlaceholderLiquidity({token0, token1, positionInfo}){
        const poolInfo = await this.getPoolInfo()
        
        const configuredPool = new Pool(
            token0,
            token1,
            poolInfo.fee,
            poolInfo.sqrtPriceX96,
            poolInfo.liquidity.toString(),
            poolInfo.tick
        )

        // const tickUpper = nearestUsableTick(poolInfo.tick, poolInfo.tickSpacing) + poolInfo.tickSpacing * this.tickUpperMultiplier
        // const tickLower = nearestUsableTick(poolInfo.tick, poolInfo.tickSpacing) - poolInfo.tickSpacing * this.tickLowerMultiplier

        const { tickLower, tickUpper } = positionInfo

        // create position using the maximum liquidity from input amounts
        return new Position({
            pool: configuredPool,
            tickLower,
            tickUpper,
            liquidity: 1,
        })
    }

    async getCurrentPosition(poolInfo, positionInfo){

        const configuredPool = new Pool(
            this.token0,
            this.token1,
            poolInfo.fee,
            poolInfo.sqrtPriceX96,
            poolInfo.liquidity.toString(),
            poolInfo.tick
        )

        const { liquidity, tickLower, tickUpper } = positionInfo
        
        return new Position({
            pool: configuredPool,
            liquidity,
            tickLower,
            tickUpper,
        })
    }

    async getLastActivePosition(){
        const poolInfo = await this.getPoolInfo();

        const positionContract = new ethers.Contract(
            NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
            NONFUNGIBLE_POSITION_MANAGER_ABI,
            this.connection.provider
        )
    
        // Get number of positions
        const balance = await positionContract.balanceOf(this.connection.wallet.address)
    
        for (let i = balance - 1; i >= 0; i--) {
            const tokenOfOwnerByIndex = await positionContract.tokenOfOwnerByIndex(this.connection.wallet.address, i)
            logger.info(`check positionId: ${tokenOfOwnerByIndex.toString()}`)
            const positionInfo = await this.getPositionInfo(tokenOfOwnerByIndex.toString())
            if (positionInfo.liquidity > 0 && positionInfo.tickUpper > poolInfo.tick &&  poolInfo.tick > positionInfo.tickLower){
                return tokenOfOwnerByIndex.toString()
            }
        }
    }


    async mintPosition({rawToken0Amount, rawToken1Amount}){
        logger.info(`start mintPosition`)
        
        const approvalStatus0 = await this.checkApproval({token: this.token0, spender: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS, rawAmount: rawToken0Amount})
        const approvalStatus1 = await this.checkApproval({token: this.token1, spender: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS, rawAmount: rawToken1Amount})

        if (!approvalStatus0 || !approvalStatus1){
            logger.error('Approve error')
            return
        }

        const positionToMint = await this.constructNewPosition(this.token0, this.token1, rawToken0Amount, rawToken1Amount)

        const block = await this.connection.provider.getBlock(this.connection.provider.getBlockNumber());
        const mintOptions = {
            recipient: this.connection.wallet.address,
            slippageTolerance: new Percent(50, 10_000),
            deadline: block.timestamp + 200
            // deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        }

        // get calldata for minting a position
        const { calldata, value } = NonfungiblePositionManager.addCallParameters(
            positionToMint,
            mintOptions
        )
        
        // build transaction
        const txInfo = {
            data: calldata,
            to: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
            value,
        }

        try{
            const gasLimit = await this.connection.provider.estimateGas(txInfo);
            console.log(`gasEstimated for mint position: ${+gasLimit}`)
        } catch (e){
            logger.error('Error while gas estimated')
            logger.error(e.message)
        }

        const txStatus = await this.connection.sendRawTransaction({txInfo, chainName: CHAIN_NAME});

        if (txStatus != 1){
            logger.error('Mint position transaction error!')
            return
        }
    }

    // TODO: try me
    // async multiswap(tokenIn, tokenOut){
    //     const swapRouterContract = new ethers.Contract(
    //         this.swapRouterAddress,
    //         V3SwapRouterABI.concat(PeripheryPaymentsABI).concat(MulticallABI)
    //     )
    //     const deadline = Math.floor(Date.now() / 1000) + 60 * 10

    //     const params = {
    //         tokenIn,
    //         tokenOut,
    //         fee: FeeAmount.MEDIUM,
    //         recipient: this.connection.wallet.address,
    //         deadline: deadline,
    //         amountIn: ethers.utils.parseEther('1'),
    //         amountOutMinimum: 0,
    //         sqrtPriceLimitX96: 0
    //     }

    //     const encData1 = swapRouterContract.interface.encodeFunctionData("exactInputSingle", [params])

    //     const calls = [encData1]
    //     const encMultiCall = swapRouterContract.interface.encodeFunctionData("multicall", [calls])

    //     const txArgs = {
    //         to: this.swapRouterAddress,
    //         from: this.connection.wallet.address,
    //         data: encMultiCall
    //     }

    //     const tx = await this.connection.wallet.sendTransaction(transaction);
    //     logger.info(`txInfo for swap: ${tx}`);

    //     const receipt = await tx.wait();

    //     logger.info(`receipt for swap ${receipt}`); 
    // }


    /**
     *
     * @param {Token} tokenIn
     * @param {Token} tokenOut
     * @param {string} amountIn
     */
    async swap(tokenIn, tokenOut, amountIn){

        logger.info(`start swap`)

        const approvalStatus = await this.checkApproval({token: tokenIn, spender: this.swapRouterAddress, rawAmount: amountIn})
        if (!approvalStatus){
            logger.error('approval error')
            return
        }

        const network = await this.connection.provider.getNetwork()
        const router = new AlphaRouter({ chainId: network.chainId, provider: this.connection.provider })
        const options = {
            recipient: this.connection.wallet.address,
            slippageTolerance: new Percent(50, 10_000),
            deadline: Math.floor(Date.now() / 1000 + 1800),
            type: SwapType.SWAP_ROUTER_02,
          }

        const route = await router.route(
            CurrencyAmount.fromRawAmount(tokenIn, amountIn),
            tokenOut,
            TradeType.EXACT_INPUT,
            options
        )

        

        const txInfo = {
            data: route.methodParameters?.calldata,
            to: this.swapRouterAddress,
            value: route?.methodParameters?.value,
        }

        try{
            const gasLimit = await this.connection.provider.estimateGas(txInfo);
            console.log(`gasEstimated for mint position: ${+gasLimit}`)
        } catch (e){
            logger.error('Error while gas estimated')
            logger.error(e.message)
        }   

        const txStatus = await this.connection.sendRawTransaction({txInfo, chainName: CHAIN_NAME});

        if (txStatus != 1){
            logger.error('swap transaction error!')
            return
        }
    }

    async swapAndAddLiqudity({positionId, balance0, balance1}){

        const prepareBalance0 = ethers.utils.parseUnits((balance0 - MIN_BALANCE_TOKEN0).toFixed(this.token0.decimals), this.token0.decimals) 
        const prepareBalance1 = ethers.utils.parseUnits((balance1 - MIN_BALANCE_TOKEN1).toFixed(this.token1.decimals), this.token1.decimals)

        const approvalStatus0 = await this.checkApproval({token: this.token0, spender: this.swapRouterAddress, rawAmount: prepareBalance0})
        const approvalStatus1 = await this.checkApproval({token: this.token1, spender: this.swapRouterAddress, rawAmount: prepareBalance1})
        if (!approvalStatus0 || !approvalStatus1){
            logger.error('approvals error')
            return 0
        }

        const network = await this.connection.provider.getNetwork()
        const router = new AlphaRouter({ chainId: network.chainId, provider: this.connection.provider })

        const token0CurrencyAmount = CurrencyAmount.fromRawAmount(this.token0, prepareBalance0)
        const token1CurrencyAmount = CurrencyAmount.fromRawAmount(this.token1, prepareBalance1)

        const positionInfo = await this.getPositionInfo(positionId)
        const currentPosition = await this.constructPositionWithPlaceholderLiquidity({token0: this.token0, token1: this.token1, positionInfo})
        const swapAndAddConfig = {
            ratioErrorTolerance: new Fraction(1, 100),
            maxIterations: 6,
          }

        const swapAndAddOptions = {
            swapOptions: {
                type: SwapType.SWAP_ROUTER_02,
                recipient: this.connection.wallet.address,
                slippageTolerance: new Percent(50, 10_000),
                deadline: Math.floor(Date.now() / 1000 + 1800),
            },
            addLiquidityOptions: {
                tokenId: positionId,
            },
        }

        const routeToRatioResponse = await router.routeToRatio(
            token0CurrencyAmount,
            token1CurrencyAmount,
            currentPosition,
            swapAndAddConfig,
            swapAndAddOptions
          )

        if (!routeToRatioResponse ||routeToRatioResponse.status !== SwapToRatioStatus.SUCCESS){
            logger.error(`Error while route to ratio`)
            return 0
        }

        const route = routeToRatioResponse.result

        const txInfo = {
            data: route.methodParameters?.calldata,
            to: this.swapRouterAddress,
            value: route.methodParameters?.value,
        }

        try{
            const gasLimit = await this.connection.provider.estimateGas(txInfo);
            console.log(`gasEstimated for mint position: ${+gasLimit}`)
        } catch (e){
            logger.error('Error while gas estimated')
            logger.error(e.message)
        }

        return this.connection.sendRawTransaction({txInfo, chainName: CHAIN_NAME})
    }

    async removeLiquidity(positionId, poolInfo, positionInfo){
        logger.info(`start remove Liquidity ${positionId}`)
    
        const currentPosition = await this.getCurrentPosition(poolInfo, positionInfo)
        logger.info(currentPosition)
    
        const collectOptions = {
            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(this.token0, 0),
            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(this.token1, 0),
            recipient: this.connection.wallet.address,
        }
    
        const removeLiquidityOptions = {
            deadline: Math.floor(Date.now() / 1000) + 60 * 20,
            slippageTolerance: new Percent(50, 10_000),
            tokenId: positionId,
            // liquidityPercentage: new Percent(CurrentConfig.tokens.fractionToRemove),
            liquidityPercentage: new Percent(1),
            collectOptions,
        }
        // get calldata for minting a position
        const { calldata, value } = NonfungiblePositionManager.removeCallParameters(
            currentPosition,
            removeLiquidityOptions
        )
    
        // build transaction
        const txInfo = {
            data: calldata,
            to: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
            value: value.toString(),
        }

        try{
            const gasLimit = await this.connection.provider.estimateGas(txInfo);
            console.log(`gasEstimated for mint position: ${+gasLimit}`)
        } catch (e){
            logger.error('Error while gas estimated')
            logger.error(e.message)
        }

        const txStatus = await this.connection.sendRawTransaction({txInfo, chainName: CHAIN_NAME});

        if (txStatus != 1){
            logger.error('remove liquidity error!')
            return
        }

        await sendMessageToTelegram(`Произошел вывод ликвидности для кошелька: ${this.connection.wallet.address} - номер позиции: ${positionId}`)        
    }

    async checkAndRemovePosition(){
        const poolInfo = await this.getPoolInfo();
        const positionIds = await this.getPositionIds(this.connection.wallet.address)
        logger.info(`positions ids: ${positionIds}`)
        for (let positionId of positionIds) {
            const positionInfo = await this.getPositionInfo(positionId);
        
            if (positionInfo.liquidity > 0 && (poolInfo.tick > positionInfo.tickUpper || poolInfo.tick < positionInfo.tickLower)){
                await this.checkRewards(positionId)
                await this.removeLiquidity(positionId, poolInfo, positionInfo);
            }
        }
    }

    //deprecated
    async prepareBalanceAndMintPosition(){
        const {balance0, balance1} = await this.getTokenBalances()
        const {price0, price1} = await this.getTokenPrices()
        const sum0 = price0 * (balance0 - MIN_BALANCE_TOKEN0)
        const sum1 = price1 * (balance1 - MIN_BALANCE_TOKEN1)
        const differenceSum = Math.abs(sum0 - sum1)

        if (sum0 + sum1 <= MIN_SUM_BALANCE){
            logger.info('Balance not enough')
            return false
        }

        logger.info(`differenceSum: ${differenceSum}`)

        if (differenceSum > MIN_DIFFERENCE_SUM){
            let amountIn = 0
            let tokenIn = ''
            let tokenOut = ''
            if (sum0 > sum1){
                tokenIn = this.token0
                tokenOut = this.token1
                amountIn = differenceSum / 2 / price0
            } else {
                tokenIn = this.token1
                tokenOut = this.token0
                amountIn = differenceSum / 2 / price1
            }

            logger.info(`amountIn for swap: ${amountIn}`)

            if (amountIn == 0 || !tokenIn || !tokenOut){
                logger.error('params for swap error')
                return false
            }

            const status = await this.swap(tokenIn, tokenOut, ethers.utils.parseUnits(amountIn.toFixed(tokenIn.decimals), tokenIn.decimals))
            if (status != 1){
                logger.error('Swap transaction error!')
                return false
            }
        }

        const {balance0: newBalance0, balance1: newBalance1} = await this.getTokenBalances()

        const prepareBalance0 = ethers.utils.parseUnits((newBalance0 - MIN_BALANCE_TOKEN0).toFixed(this.token0.decimals), this.token0.decimals) 
        const prepareBalance1 = ethers.utils.parseUnits((newBalance1 - MIN_BALANCE_TOKEN1).toFixed(this.token1.decimals), this.token1.decimals)

        await this.mintPosition({rawToken0Amount: prepareBalance0, rawToken1Amount: prepareBalance1})
    }

    async mintPositionAndAddLiquidity(){
        logger.info('start mint position and add liquidity')

        const {balance0, balance1} = await this.getTokenBalances()
        const {price0, price1} = await this.getTokenPrices()
        const sum0 = price0 * (balance0 - MIN_BALANCE_TOKEN0)
        const sum1 = price1 * (balance1 - MIN_BALANCE_TOKEN1)
        if (sum0 + sum1 <= MIN_SUM_BALANCE){
            logger.info('Balance not enough')
            return false
        }

        let positionId = await this.getLastActivePosition()
        if (typeof positionId === 'undefined'){
            const rawToken0Amount = ethers.utils.parseUnits(MIN_BALANCE_TOKEN0_FOR_MINT.toString(), this.token0.decimals) 
            const rawToken1Amount = ethers.utils.parseUnits(MIN_BALANCE_TOKEN1_FOR_MINT.toString(), this.token1.decimals)
            const mintStatus = await this.mintPosition({rawToken0Amount, rawToken1Amount})
            let sle = randomIntInRange(50, 100);
            logger.loinfog(`Задержка ${sle}с..`)
            await sleep(sle * 1000)
            positionId = await this.getLastActivePosition()
        }

        logger.info(`positionId: ${positionId}`)
        if (typeof positionId === 'undefined'){
            logger.error(`Not found active position`)
            return false
        }

        for (let i = 0; i < RETRY_COUNT_SWAP_AND_ADD_LIQUIDITY; i++){
            const swapStatus = await this.swapAndAddLiqudity({positionId, balance0, balance1})
            if (!swapStatus){
                let sle = randomIntInRange(50, 100);
                logger.loinfog(`Задержка ${sle}с..`)
                await sleep(sle * 1000)
                continue
            }
            const poolInfo = await this.getPoolInfo()
            const positionInfo = await this.getPositionInfo(positionId)
            const {amount0, amount1} = await getTokenAmountsFromPool(positionInfo.liquidity, poolInfo.sqrtPriceX96, positionInfo.tickLower, positionInfo.tickUpper, this.token0.decimals, this.token1.decimals)

            const currentDate = moment().format('DD.MM.YYYY');
            const data = [currentDate, this.connection.wallet.address, 'Deposit', this.token0.name, (+amount0).toPrecision(6), (+price0).toPrecision(5), Math.round(amount0 * price0), this.token1.name, (+amount1).toPrecision(6), (+price1).toPrecision(5), Math.round(amount1 * price1)]
            logger.info(`data for write sheets: ${data}`)
            await writeSheet('Liqudity', data)

            return true

        }
        
        logger.error(`Error while swapAndAddLiqudity`)
        return false
    }
}