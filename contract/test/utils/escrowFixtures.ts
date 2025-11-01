import { ethers } from "hardhat";
import {
    TestToken,
    MockSecureLBPForEscrow,
    TokenVestingEscrow
} from "../../typechain-types";

export interface EscrowFixtureContext {
    owner: any;
    user: any;
    other: any;
    token: TestToken;
    lbp: MockSecureLBPForEscrow;
    escrow: TokenVestingEscrow;
}

export async function deployEscrowFixture(): Promise<EscrowFixtureContext> {
    const [owner, user, other] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("TestToken");
    const token = (await Token.deploy(ethers.parseEther("1000000"))) as TestToken;
    await token.waitForDeployment();

    const MockLBP = await ethers.getContractFactory("MockSecureLBPForEscrow");
    const lbp = (await MockLBP.deploy(await token.getAddress())) as MockSecureLBPForEscrow;
    await lbp.waitForDeployment();

    const Escrow = await ethers.getContractFactory("TokenVestingEscrow");
    const escrow = (await Escrow.deploy(await token.getAddress(), await lbp.getAddress())) as TokenVestingEscrow;
    await escrow.waitForDeployment();

    return {
        owner,
        user,
        other,
        token,
        lbp,
        escrow
    };
}
