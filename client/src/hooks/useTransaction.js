import { useState, useCallback } from "react";
import { handleTxError, showTxSuccess, showTxInfo } from "../utils/txErrorHandler";

/**
 * Hook for managing transaction state and execution
 */
export const useTransaction = () => {
  const [state, setState] = useState(null);

  const execute = useCallback(async (txFn, options = {}) => {
    const {
      pendingMessage = "Processing transaction…",
      successMessage = "Transaction confirmed successfully!",
      errorMessage = "Transaction failed",
      onSuccess,
      onError,
    } = options;

    try {
      setState({ status: "pending", message: pendingMessage });
      showTxInfo("Please confirm the transaction in your wallet", { autoClose: false });

      const tx = await txFn();

      showTxInfo("Transaction submitted to the network", { autoClose: 3000 });
      setState({ status: "pending", message: "Transaction in mempool", hash: tx.hash });

      await tx.wait();

      showTxSuccess(successMessage, { autoClose: 3000 });
      setState({ status: "success", message: successMessage, hash: tx.hash });

      if (onSuccess) {
        await onSuccess(tx);
      }

      return tx;
    } catch (error) {
      console.error("Transaction error:", error);
      handleTxError(error, errorMessage);
      setState({ status: "error", message: error?.message || errorMessage });

      if (onError) {
        onError(error);
      }

      return null;
    }
  }, []);

  const clear = useCallback(() => {
    setState(null);
  }, []);

  return {
    state,
    execute,
    clear,
    isPending: state?.status === "pending",
    isSuccess: state?.status === "success",
    isError: state?.status === "error",
  };
};

