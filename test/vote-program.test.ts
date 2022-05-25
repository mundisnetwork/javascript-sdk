import {expect, use} from 'chai';
import chaiAsPromised from 'chai-as-promised';

import {
  Keypair,
  LAMPORTS_PER_MUNDIS,
  VoteAuthorizationLayout,
  VoteInit,
  VoteInstruction,
  VoteProgram,
  sendAndConfirmTransaction,
  SystemInstruction,
  Connection,
} from '../src';
import {helpers} from './mocks/rpc-http';
import {url} from './url';

use(chaiAsPromised);

describe('VoteProgram', () => {
  it('createAccount', () => {
    const fromPubkey = Keypair.generate().publicKey;
    const newAccountPubkey = Keypair.generate().publicKey;
    const authorizedPubkey = Keypair.generate().publicKey;
    const nodePubkey = Keypair.generate().publicKey;
    const commission = 5;
    const voteInit = new VoteInit(
      nodePubkey,
      authorizedPubkey,
      authorizedPubkey,
      commission,
    );
    const lamports = 123;
    const transaction = VoteProgram.createAccount({
      fromPubkey,
      votePubkey: newAccountPubkey,
      voteInit,
      lamports,
    });
    expect(transaction.instructions).to.have.length(2);
    const [systemInstruction, voteInstruction] = transaction.instructions;
    const systemParams = {
      fromPubkey,
      newAccountPubkey,
      lamports,
      space: VoteProgram.space,
      programId: VoteProgram.programId,
    };
    expect(systemParams).to.eql(
      SystemInstruction.decodeCreateAccount(systemInstruction),
    );

    const initParams = {votePubkey: newAccountPubkey, nodePubkey, voteInit};
    expect(initParams).to.eql(
      VoteInstruction.decodeInitializeAccount(voteInstruction),
    );
  });

  it('initialize', () => {
    const newAccountPubkey = Keypair.generate().publicKey;
    const authorizedPubkey = Keypair.generate().publicKey;
    const nodePubkey = Keypair.generate().publicKey;
    const voteInit = new VoteInit(
      nodePubkey,
      authorizedPubkey,
      authorizedPubkey,
      5,
    );
    const initParams = {
      votePubkey: newAccountPubkey,
      nodePubkey,
      voteInit,
    };
    const initInstruction = VoteProgram.initializeAccount(initParams);
    expect(initParams).to.eql(
      VoteInstruction.decodeInitializeAccount(initInstruction),
    );
  });

  it('authorize', () => {
    const votePubkey = Keypair.generate().publicKey;
    const authorizedPubkey = Keypair.generate().publicKey;
    const newAuthorizedPubkey = Keypair.generate().publicKey;
    const voteAuthorizationType = VoteAuthorizationLayout.Voter;
    const params = {
      votePubkey,
      authorizedPubkey,
      newAuthorizedPubkey,
      voteAuthorizationType,
    };
    const transaction = VoteProgram.authorize(params);
    expect(transaction.instructions).to.have.length(1);
    const [authorizeInstruction] = transaction.instructions;
    expect(params).to.eql(
      VoteInstruction.decodeAuthorize(authorizeInstruction),
    );
  });

  it('withdraw', () => {
    const votePubkey = Keypair.generate().publicKey;
    const authorizedWithdrawerPubkey = Keypair.generate().publicKey;
    const toPubkey = Keypair.generate().publicKey;
    const params = {
      votePubkey,
      authorizedWithdrawerPubkey,
      lamports: 123,
      toPubkey,
    };
    const transaction = VoteProgram.withdraw(params);
    expect(transaction.instructions).to.have.length(1);
    const [withdrawInstruction] = transaction.instructions;
    expect(params).to.eql(VoteInstruction.decodeWithdraw(withdrawInstruction));
  });

  if (process.env.TEST_LIVE) {
    it('live vote actions', async () => {
      const connection = new Connection(url, 'confirmed');

      const newVoteAccount = Keypair.generate();
      const nodeAccount = Keypair.generate();

      const payer = Keypair.generate();
      await helpers.airdrop({
        connection,
        address: payer.publicKey,
        amount: 12 * LAMPORTS_PER_MUNDIS,
      });
      expect(await connection.getBalance(payer.publicKey)).to.eq(
        12 * LAMPORTS_PER_MUNDIS,
      );

      const authorized = Keypair.generate();
      await helpers.airdrop({
        connection,
        address: authorized.publicKey,
        amount: 12 * LAMPORTS_PER_MUNDIS,
      });
      expect(await connection.getBalance(authorized.publicKey)).to.eq(
        12 * LAMPORTS_PER_MUNDIS,
      );

      const minimumAmount = await connection.getMinimumBalanceForRentExemption(
        VoteProgram.space,
      );

      // Create initialized Vote account
      let createAndInitialize = VoteProgram.createAccount({
        fromPubkey: payer.publicKey,
        votePubkey: newVoteAccount.publicKey,
        voteInit: new VoteInit(
          nodeAccount.publicKey,
          authorized.publicKey,
          authorized.publicKey,
          5,
        ),
        lamports: minimumAmount + 10 * LAMPORTS_PER_MUNDIS,
      });
      await sendAndConfirmTransaction(
        connection,
        createAndInitialize,
        [payer, newVoteAccount, nodeAccount],
        {preflightCommitment: 'confirmed'},
      );
      expect(await connection.getBalance(newVoteAccount.publicKey)).to.eq(
        minimumAmount + 10 * LAMPORTS_PER_MUNDIS,
      );

      // Withdraw from Vote account
      let recipient = Keypair.generate();
      let withdraw = VoteProgram.withdraw({
        votePubkey: newVoteAccount.publicKey,
        authorizedWithdrawerPubkey: authorized.publicKey,
        lamports: LAMPORTS_PER_MUNDIS,
        toPubkey: recipient.publicKey,
      });
      await sendAndConfirmTransaction(connection, withdraw, [authorized], {
        preflightCommitment: 'confirmed',
      });
      expect(await connection.getBalance(recipient.publicKey)).to.eq(
        LAMPORTS_PER_MUNDIS,
      );

      const newAuthorizedWithdrawer = Keypair.generate();
      await helpers.airdrop({
        connection,
        address: newAuthorizedWithdrawer.publicKey,
        amount: LAMPORTS_PER_MUNDIS,
      });
      expect(
        await connection.getBalance(newAuthorizedWithdrawer.publicKey),
      ).to.eq(LAMPORTS_PER_MUNDIS);

      // Authorize a new Withdrawer.
      let authorize = VoteProgram.authorize({
        votePubkey: newVoteAccount.publicKey,
        authorizedPubkey: authorized.publicKey,
        newAuthorizedPubkey: newAuthorizedWithdrawer.publicKey,
        voteAuthorizationType: VoteAuthorizationLayout.Withdrawer,
      });
      await sendAndConfirmTransaction(connection, authorize, [authorized], {
        preflightCommitment: 'confirmed',
      });

      // Test old authorized cannot withdraw anymore.
      withdraw = VoteProgram.withdraw({
        votePubkey: newVoteAccount.publicKey,
        authorizedWithdrawerPubkey: authorized.publicKey,
        lamports: minimumAmount,
        toPubkey: recipient.publicKey,
      });
      await expect(
        sendAndConfirmTransaction(connection, withdraw, [authorized], {
          preflightCommitment: 'confirmed',
        }),
      ).to.be.rejected;

      // Test newAuthorizedWithdrawer may withdraw.
      recipient = Keypair.generate();
      withdraw = VoteProgram.withdraw({
        votePubkey: newVoteAccount.publicKey,
        authorizedWithdrawerPubkey: newAuthorizedWithdrawer.publicKey,
        lamports: LAMPORTS_PER_MUNDIS,
        toPubkey: recipient.publicKey,
      });
      await sendAndConfirmTransaction(
        connection,
        withdraw,
        [newAuthorizedWithdrawer],
        {
          preflightCommitment: 'confirmed',
        },
      );
      expect(await connection.getBalance(recipient.publicKey)).to.eq(
        LAMPORTS_PER_MUNDIS,
      );

      const newAuthorizedVoter = Keypair.generate();
      await helpers.airdrop({
        connection,
        address: newAuthorizedVoter.publicKey,
        amount: LAMPORTS_PER_MUNDIS,
      });
      expect(await connection.getBalance(newAuthorizedVoter.publicKey)).to.eq(
        LAMPORTS_PER_MUNDIS,
      );

      // The authorized Withdrawer may sign to authorize a new Voter, see
      // https://github.com/solana-labs/solana/issues/22521
      authorize = VoteProgram.authorize({
        votePubkey: newVoteAccount.publicKey,
        authorizedPubkey: newAuthorizedWithdrawer.publicKey,
        newAuthorizedPubkey: newAuthorizedVoter.publicKey,
        voteAuthorizationType: VoteAuthorizationLayout.Voter,
      });
      await sendAndConfirmTransaction(
        connection,
        authorize,
        [newAuthorizedWithdrawer],
        {
          preflightCommitment: 'confirmed',
        },
      );
    }).timeout(10 * 1000);
  }
});
