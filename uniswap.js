import { ethers } from "ethers"
import moment from 'moment'
import { Token, Percent, CurrencyAmount, TradeType } from '@uniswap/sdk-core'
import { getPrices } from "./helpers.js";
import {writeSheet} from './googleSheets.js'
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert { type: "json" }
import { nearestUsableTick, NonfungiblePositionManager, Pool, Position, computePoolAddress, FeeAmount } from '@uniswap/v3-sdk'
import {AlphaRouter, SwapType} from '@uniswap/smart-order-router'
import { ERC20_ABI, NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS, NONFUNGIBLE_POSITION_MANAGER_ABI, V3_SWAP_ROUTER_ADDRESS_02, POOL_FACTORY_CONTRACT_ADDRESS } from './constants.js'
import {logger, TICK_UPPER_MULTIPLIER, TICK_LOWER_MULTIPLIER, MAX_PRICE_COEFFICIENT, MIN_PRICE_COEFFICIENT, MAX_FEE_PER_GAS, MAX_PRIORITY_FEE_PER_GAS, MIN_SUM_BALANCE, GAS_LIMIT} from './config.js'
import dotenv from 'dotenv'
dotenv.config()

export class Uniswap {
    constructor(token0, token1, fee) {
        this.token0 = token0;
        this.token0minBalance = 0
        this.token1minBalance = 10
        this.token1 = token1;
        this.fee = fee
        this.gasLimit = GAS_LIMIT
        this.maxFeePerGas = MAX_FEE_PER_GAS
        this.maxPriorityFeePerGas = MAX_PRIORITY_FEE_PER_GAS
        this.tickUpperMultiplier = TICK_UPPER_MULTIPLIER
        this.tickLowerMultiplier = TICK_LOWER_MULTIPLIER
        this.swapRouterAddress = V3_SWAP_ROUTER_ADDRESS_02
    }

    get provider(){
        return new ethers.providers.StaticJsonRpcProvider(process.env.PROVIDER) 
    }

    get wallet(){
        return new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, this.provider)
    }

    async getPoolInfo(){
        if (!this.provider) {
            throw new Error('No provider')
        }

        const currentPoolAddress = computePoolAddress({
            factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
            tokenA: this.token0,
            tokenB: this.token1,
            fee: this.fee,
        })

        const poolContract = new ethers.Contract(
            currentPoolAddress,
            IUniswapV3PoolABI.abi,
            this.provider
        )

        const [token0, token1, fee, tickSpacing, liquidity, slot0] =
            await Promise.all([
            poolContract.token0(),
            poolContract.token1(),
            poolContract.fee(),
            poolContract.tickSpacing(),
            poolContract.liquidity(),
            poolContract.slot0(),
            ])

        return {token0, token1, fee, tickSpacing, liquidity, sqrtPriceX96: slot0[0], tick: slot0[1]}
    }

    async getPositionInfo(positionId){
        if (!this.provider) {
            throw new Error('No provider available')
        }

        const positionContract = new ethers.Contract(
            NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
            NONFUNGIBLE_POSITION_MANAGER_ABI,
            this.provider
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
        if (!this.provider || !address) {
            throw new Error('No provider available')
        }
    
        const positionContract = new ethers.Contract(
            NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
            NONFUNGIBLE_POSITION_MANAGER_ABI,
            this.provider
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
        const token0Contract = new ethers.Contract(this.token0.address, ERC20_ABI, this.provider)
        const token1Contract = new ethers.Contract(this.token1.address, ERC20_ABI, this.provider)

        const balance0 = await token0Contract.balanceOf(this.wallet.address)
        logger.info(`balance0: ${ethers.utils.formatUnits(balance0, this.token0.decimals)}`)

        const balance1 = await token1Contract.balanceOf(this.wallet.address)
        logger.info(`balance1: ${ethers.utils.formatUnits(balance1, this.token1.decimals)}`)

        return {balance0, balance1}
    }

    async getTokenPrices(){
        const prices = await getPrices(`${this.token0.name},${this.token1.name}`)
        logger.info('prices', prices)

        return {price0: prices[`${this.token0.name}`], price1: prices[`${this.token1.name}`]}
    }

    async checkApproval(token, spender, amount){
        if (!this.wallet.address || !this.provider) {
            return 'Failed'
        }

        try {
            logger.info(`token transfer approval for: ${token.symbol}`)
            const tokenContract = new ethers.Contract(token.address, ERC20_ABI, this.provider)

            let allowance = await tokenContract.allowance(this.wallet.address, spender)
            
            logger.info(`allowance: ${ethers.utils.formatUnits(allowance, token.decimals)} - amount: ${ethers.utils.formatUnits(amount, token.decimals)}` )

            if (parseFloat(allowance) >= parseFloat(amount)){
                logger.info(`dont need allowance for: ${token.symbol}`)
                return
            }

            let transaction = await tokenContract.populateTransaction.approve(spender, amount.toString())

            transaction = {
                gasLimit: this.gasLimit,
                maxFeePerGas: this.maxFeePerGas,
                maxPriorityFeePerGas: this.maxPriorityFeePerGas,
                from: this.wallet.address,
                ...transaction,
            }
        
            const tx = await this.wallet.sendTransaction(transaction);
            logger.info(`txInfo for token transfer approval:`, tx);

            const receipt = await tx.wait();
            logger.info(`receipt for token transfer approval:`, receipt);
        
        } catch (e) {
            console.error(e)
            return 'Failed'
        }
    }

    async constructNewPosition(token0, token1, amount0, amount1) {
        const poolInfo = await this.getPoolInfo()
        
        const configuredPool = new Pool(
            token0,
            token1,
            poolInfo.fee,
            poolInfo.sqrtPriceX96.toString(),
            poolInfo.liquidity.toString(),
            poolInfo.tick
        )
    
        const tokenPrice1 = configuredPool.token0Price.toSignificant(10);
        const tokenPrice2 = configuredPool.token1Price.toSignificant(10);
    
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

    async getCurrentPosition(poolInfo, positionInfo){

        const configuredPool = new Pool(
            this.token0,
            this.token1,
            poolInfo.fee,
            poolInfo.sqrtPriceX96.toString(),
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


    async mintPosition(){
        if (!this.wallet.address || !this.provider) {
            return 'Failed'
        }
        const {balance0, balance1} = await this.getTokenBalances()
        const {price0, price1} = await this.getTokenPrices()

        const prepareBalance0 = ethers.utils.formatUnits(balance0, this.token0.decimals) - this.token0minBalance
        
        await this.checkApproval(this.token0, NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS, balance0)
        await this.checkApproval(this.token1, NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS, balance1)

        const positionToMint = await this.constructNewPosition(this.token0, this.token1, balance0, balance1)

        const block = await this.provider.getBlock(this.provider.getBlockNumber());
        const mintOptions = {
            recipient: this.wallet.address,
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
        const transaction = {
            data: calldata,
            to: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
            value: value,
            from: this.wallet.address,
            gasLimit: this.gasLimit,
            maxFeePerGas: this.maxFeePerGas,
            maxPriorityFeePerGas: this.maxPriorityFeePerGas,
        }

        const tx = await this.wallet.sendTransaction(transaction);
        logger.info(`tx for mint position:`, tx);

        const receipt = await tx.wait();

        logger.info(`receipt for mint position:`, receipt);

        if (receipt.status == 1){
            const currentDate = moment().format('DD.MM.YYYY');
            const formatBalance0 =  ethers.utils.formatUnits(balance0, this.token0.decimals)
            const formatBalance1 =  ethers.utils.formatUnits(balance1, this.token1.decimals)
            const data = [currentDate, this.wallet.address, 'Deposit', this.token0.name, formatBalance0, price0, formatBalance0 * price0, this.token1.name, formatBalance1, price1, formatBalance1 * price1]
            logger.info(`data for write sheets: ${data}`)
            try{
                await writeSheet('Liqudity', data)
            } catch (e) {
                logger.error(e)
            }
        } else {
            logger.error('Transaction error!')
        }

    }

    // TODO: try me
    async multiswap(tokenIn, tokenOut){
        const swapRouterContract = new ethers.Contract(
            this.swapRouterAddress,
            V3SwapRouterABI.concat(PeripheryPaymentsABI).concat(MulticallABI)
        )
        const deadline = Math.floor(Date.now() / 1000) + 60 * 10

        const params = {
            tokenIn,
            tokenOut,
            fee: FeeAmount.MEDIUM,
            recipient: this.wallet.address,
            deadline: deadline,
            amountIn: ethers.utils.parseEther('1'),
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        }

        const encData1 = swapRouterContract.interface.encodeFunctionData("exactInputSingle", [params])

        const calls = [encData1]
        const encMultiCall = swapRouterContract.interface.encodeFunctionData("multicall", [calls])

        const txArgs = {
            to: this.swapRouterAddress,
            from: this.wallet.address,
            data: encMultiCall
        }

        const tx = await this.wallet.sendTransaction(transaction);
        logger.info(`txInfo for swap: ${tx}`);

        const receipt = await tx.wait();

        logger.info(`receipt for swap ${receipt}`); 
    }


    /**
     *
     * @param {Token} tokenIn
     * @param {Token} tokenOut
     * @param {string} amountIn
     */
    async swap(tokenIn, tokenOut, amountIn){

        if (!this.wallet || !this.provider) {
            return 'Failed'
        }

        logger.info(`start swap liquidity}`)

        await this.checkApproval(tokenIn, this.swapRouterAddress, amountIn)

        const network = await this.provider.getNetwork()
        const router = new AlphaRouter({ chainId: network.chainId, provider: this.provider })
        const options = {
            recipient: this.wallet.address,
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

        const tx = await this.wallet.sendTransaction({
            data: route.methodParameters?.calldata,
            to: this.swapRouterAddress,
            value: route?.methodParameters?.value,
            from: this.wallet.address,
            gasLimit: this.gasLimit,
            maxFeePerGas: this.maxFeePerGas,
            maxPriorityFeePerGas: this.maxPriorityFeePerGas,
        })

        logger.info(`txInfo for swap:`, tx);

        const receipt = await tx.wait();

        logger.info('swap transaction receipt', receipt)

        return receipt
    
    }

    async removeLiquidity(positionId, poolInfo, positionInfo){
        if (!this.wallet) {
            return 'Failed'
        }
    
        logger.info(`start remove Liquidity ${positionId}`)
    
        const currentPosition = await this.getCurrentPosition(poolInfo, positionInfo)

        logger.info('currentPosition', currentPosition)
    
        const collectOptions = {
            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(this.token0, 0),
            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(this.token1, 0),
            recipient: this.wallet.address,
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
        const transaction = {
            data: calldata,
            to: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
            value: value.toString(),
            from: this.wallet.address,
            maxFeePerGas: this.maxFeePerGas,
            maxPriorityFeePerGas: this.maxPriorityFeePerGas,
            gasLimit: this.gasLimit,
        }
    
        const tx = await this.wallet.sendTransaction(transaction);
    
        const receipt = await tx.wait();
        logger.info('receipt for remove liquidity', receipt);
        if (receipt.status == 1){
            const currentDate = moment().format('DD.MM.YYYY');
            const data = [currentDate, this.wallet.address, 'test token', positionInfo.liquidity, 'test price']
            try{
                // await writeSheet('Liqudity', data)
            } catch (e) {
                logger.error(e)
            }
        } else {
            logger.error('Transaction error!')
        }
        
    }

    async checkAndRemovePosition(){
        const poolInfo = await this.getPoolInfo();
        const positionIds = await this.getPositionIds(this.wallet.address)
        for (let positionId of positionIds) {
            logger.info(`positionId: ${positionId}`);
            const positionInfo = await this.getPositionInfo(positionId);
            logger.info('positionInfo', positionInfo)
        
            if (positionInfo.liquidity > 0 && (poolInfo.tick > positionInfo.tickUpper || poolInfo.tick < positionInfo.tickLower)){
                await this.removeLiquidity(positionId, poolInfo, positionInfo);
            }
        }
    }

    async prepareBalanceAndMintPosition(){
        const {balance0, balance1} = await this.getTokenBalances()
        const {price0, price1} = await this.getTokenPrices()
        const sum0 = price0 * (ethers.utils.formatUnits(balance0, this.token0.decimals) - this.token0minBalance)
        const sum1 = price1 * (ethers.utils.formatUnits(balance1, this.token1.decimals) - this.token1minBalance)
        logger.info('price0', price0)
        logger.info('price1', price1)

        if (sum0 + sum1 <= MIN_SUM_BALANCE){
            logger.info('Balance not enough')
            return 'False'
        }

        const priceCoefficient = sum0/sum1

        if (priceCoefficient > MAX_PRICE_COEFFICIENT){
            // 1200 - 1000 / 2 / 1820

            const amountForSwap = (sum0 - sum1) / 2 / price0
            logger.info('amountForSwap', amountForSwap)
            const receipt = await this.swap(this.token0, this.token1, ethers.utils.parseUnits(amountForSwap.toString(), this.token0.decimals))
            if (receipt.status != 1){
                logger.error('Swap transaction error!', receipt)
                return
            }

        } else if (priceCoefficient < MIN_PRICE_COEFFICIENT){
            // 800 - 1300 / 2 / 1.3

            const amountForSwap = (sum1 - sum0) / 2 / price1
            logger.info('amountForSwap', amountForSwap)
            const receipt = await this.swap(this.token1, this.token0, ethers.utils.parseUnits(amountForSwap.toString(), this.token1.decimals))
            if (receipt.status != 1){
                logger.error('Swap transaction error!', receipt)
                return
            }
        }
        

        await this.mintPosition()
    }
}