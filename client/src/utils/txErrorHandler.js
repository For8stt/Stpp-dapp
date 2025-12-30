import { toast } from "react-toastify";

/**
 * Обробляє помилки транзакцій і відображає відповідні toast повідомлення
 * @param {Error} error - Помилка, що виникла під час транзакції
 * @param {string} defaultMessage - Повідомлення за замовчуванням, якщо тип помилки не розпізнано
 */
export const handleTxError = (error, defaultMessage = "Transaction failed") => {
  console.error("Transaction error:", error);

  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") {
    toast.error("Transaction rejected by user", {
      position: "bottom-right",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
    return;
  }

  if (error?.code === -32000 || error?.message?.includes("insufficient funds")) {
    toast.error("Insufficient funds for transaction", {
      position: "bottom-right",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
    return;
  }

  if (error?.code === "NETWORK_ERROR" || error?.message?.includes("network")) {
    toast.error("Network error. Please check your connection.", {
      position: "bottom-right",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
    return;
  }

  const errorString = JSON.stringify(error || {});
  const errorMessage = error?.message || "";
  
  const checkNestedError = (err, depth = 0) => {
    if (depth > 5) return false;
    if (!err) return false;
    
    const checks = [
      err?.reason === "OraclePausedError",
      err?.name === "OraclePausedError",
      err?.message?.includes("OraclePausedError"),
      err?.error && checkNestedError(err.error, depth + 1),
      err?.info?.error && checkNestedError(err.info.error, depth + 1),
    ];
    
    return checks.some(Boolean);
  };
  
  const isOraclePaused = 
    checkNestedError(error) ||
    errorString?.includes("OraclePausedError") ||
    errorString?.includes("OraclePaused") ||
    defaultMessage?.includes("Oracle") ||
    defaultMessage?.includes("paused by Oracle") ||
    (error?.code === "CALL_EXCEPTION" && errorString?.includes("OraclePaused"));

  if (isOraclePaused) {
    toast.error(
      defaultMessage?.includes("Oracle") || defaultMessage?.includes("paused by Oracle")
        ? defaultMessage
        : "Trading is paused by Oracle due to rapid price movement. Please wait for the pause to end before placing another bid.",
      {
        position: "bottom-right",
        autoClose: 12000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      }
    );
    return;
  }

  // Check for Merkle proof related errors
  const isInvalidProof = 
    errorMessage.includes("InvalidProof") ||
    errorMessage.includes("invalid proof") ||
    errorMessage.includes("proof") ||
    errorString.includes("InvalidProof") ||
    errorString.includes("invalid proof");

  if (isInvalidProof) {
    toast.error("Invalid Merkle proof. Your address may not be in the whitelist, or the proof is incorrect. Please verify your proof and try again.", {
      position: "bottom-right",
      autoClose: 10000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
    return;
  }

  // Check for other common auction errors
  if (errorMessage.includes("AuctionNotActive") || errorMessage.includes("not active")) {
    toast.error("⏰ Auction is not active. Please check the auction timing.", {
      position: "bottom-right",
      autoClose: 7000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
    return;
  }

  if (errorMessage.includes("CapExceeded") || errorMessage.includes("cap")) {
    toast.error("You have exceeded your per-address cap. Please reduce the quantity.", {
      position: "bottom-right",
      autoClose: 7000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
    return;
  }

  if (error?.code === "CALL_EXCEPTION" || error?.message?.includes("missing revert data")) {
    let specificMessage = defaultMessage;
    
    if (errorMessage && errorMessage.length > 0 && !errorMessage.includes("missing revert data")) {
      specificMessage = errorMessage;
    } else if (error?.data) {
      // Try to decode error data if available
      specificMessage = "Transaction failed. Please check your inputs and try again.";
    }
    
    toast.error(specificMessage, {
      position: "bottom-right",
      autoClose: 7000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
    return;
  }

  const message = error?.message || defaultMessage;
  toast.error(message, {
    position: "bottom-right",
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
  });
};

/**
 * Відображає успішне повідомлення про транзакцію
 * @param {string} message - Повідомлення успіху
 * @param {Object} options - Додаткові опції для toast
 */
export const showTxSuccess = (message, options = {}) => {
  toast.success(message, {
    position: "bottom-right",
    autoClose: 3000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options,
  });
};

/**
 * Відображає інформаційне повідомлення про транзакцію
 * @param {string} message - Інформаційне повідомлення
 * @param {Object} options - Додаткові опції для toast
 */
export const showTxInfo = (message, options = {}) => {
  const { autoClose, ...rest } = options;
  const resolvedAutoClose = typeof autoClose === "number" ? autoClose : 3000;
  toast.info(message, {
    position: "bottom-right",
    autoClose: resolvedAutoClose,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...rest,
  });
};
