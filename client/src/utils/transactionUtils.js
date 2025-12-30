import { handleTxError, showTxSuccess, showTxInfo } from "./txErrorHandler";

/**
 * Обробка помилок транзакцій з уніфікованою логікою
 */
export const handleTransactionError = (err, defaultMessage, setTxStatus) => {
  console.error("Transaction error:", err);
  
  // Перевірка на скасування користувачем
  if (
    err?.code === "ACTION_REJECTED" ||
    err?.reason === "rejected" ||
    err?.message?.includes("user rejected") ||
    err?.message?.includes("user cancel") ||
    err?.message?.includes("Transaction cancelled")
  ) {
    setTxStatus({ status: "error", message: "Transaction cancelled by user" });
    showTxInfo("Transaction cancelled by user", { autoClose: 3000 });
    return;
  }

  // Витягування повідомлення про помилку
  let errorMessage = err?.message || defaultMessage;
  if (err?.reason) {
    errorMessage = err.reason;
  } else if (err?.data?.message) {
    errorMessage = err.data.message;
  } else if (err?.error?.message) {
    errorMessage = err.error.message;
  }

  // Покращена обробка для "missing revert data" та CALL_EXCEPTION
  if (errorMessage.includes("missing revert data") || err?.code === "CALL_EXCEPTION") {
    // Якщо повідомлення вже містить детальну інформацію, використовуємо його
    if (!errorMessage.includes("Possible reasons:") && !errorMessage.includes("already been finalized")) {
      errorMessage = "Transaction failed on contract. The contract may have reverted.\n\n" +
        "Common reasons:\n" +
        "• The action has already been completed\n" +
        "• Required conditions are not met\n" +
        "• Insufficient balance or tokens\n" +
        "• Invalid contract state\n\n" +
        "Please check the contract state and try again.";
    }
  }

  handleTxError(err, errorMessage);
  setTxStatus({ status: "error", message: errorMessage });
};

/**
 * Виконання транзакції з обробкою статусу
 */
export const executeTransaction = async ({
  txPromise,
  pendingMessage,
  successMessage,
  setTxStatus,
  onSuccess,
  onError,
}) => {
  try {
    showTxInfo(pendingMessage, { autoClose: false });
    const tx = await txPromise;
    setTxStatus({ status: "pending", message: pendingMessage, hash: tx.hash });
    showTxInfo("Transaction submitted to the network", { autoClose: 3000 });
    await tx.wait();
    showTxSuccess(successMessage, { autoClose: 3000 });
    setTxStatus({ status: "success", message: successMessage });
    if (onSuccess) await onSuccess();
  } catch (err) {
    if (onError) {
      onError(err);
    } else {
      handleTransactionError(err, "Transaction failed", setTxStatus);
    }
    throw err;
  }
};

