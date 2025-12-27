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
  const checkNestedError = (err, depth = 0) => {
    if (depth > 5) return false; // Prevent infinite recursion
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
        : "⛔ Trading is paused by Oracle due to rapid price movement. Please wait for the pause to end before placing another bid.",
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

  if (error?.code === "CALL_EXCEPTION" || error?.message?.includes("missing revert data")) {
    toast.error(defaultMessage, {
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
