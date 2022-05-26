const mundis = require('../lib/index.cjs');

async function main() {
    const conn = new mundis.Connection(
        mundis.clusterApiUrl('devnet'),
        // "http://167.235.72.68:8899",
        'confirmed'
    );
    const fromAccount = mundis.Keypair.generate();
    const airdropSignature = await conn.requestAirdrop(fromAccount.publicKey, mundis.LAMPORTS_PER_MUNDIS);
    await conn.confirmTransaction(airdropSignature);

    const toAccount = mundis.Keypair.generate();
    const transaction = new mundis.Transaction().add(
        mundis.SystemProgram.transfer({
            fromPubkey: fromAccount.publicKey,
            toPubkey: toAccount.publicKey,
            lamports: mundis.LAMPORTS_PER_MUNDIS / 100,
        }),
    );

    var signature = await mundis.sendAndConfirmTransaction(
        conn,
        transaction,
        [fromAccount],
    );

    const toBalance = await conn.getBalance(toAccount.publicKey);
    console.log(`Tx: ${signature}, Dest account balance: ${toBalance}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
