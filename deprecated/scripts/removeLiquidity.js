import {removeLiquidity} from '../../liquidity.js'
import {getPoolInfo} from '../../pool.js'
import {getPositionInfo} from '../../position.js'


const positionId = 319966

async function main(){
    const poolInfo = await getPoolInfo();
    const positionInfo = await getPositionInfo(positionId);

    await removeLiquidity(positionId, poolInfo, positionInfo);
}

main()