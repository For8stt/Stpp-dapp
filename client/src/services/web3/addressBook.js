import { useEffect, useState } from "react";

import fallbackAddresses from "../../abi/addresses.json";

let cachedAddressBookPromise = null;

export const fetchAddressBook = async () => {
  if (cachedAddressBookPromise) {
    return cachedAddressBookPromise;
  }

  cachedAddressBookPromise = (async () => {
    if (typeof window === "undefined" || !window.fetch) {
      return fallbackAddresses;
    }

    try {
      const response = await fetch("/abi/addresses.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to fetch address book (${response.status})`);
      }
      return await response.json();
    } catch (error) {
      console.warn("Using bundled address book due to fetch failure:", error);
      return fallbackAddresses;
    }
  })();

  return cachedAddressBookPromise;
};

export const reloadAddressBook = () => {
  cachedAddressBookPromise = null;
  return fetchAddressBook();
};

export const useAddressBook = () => {
  const [book, setBook] = useState(fallbackAddresses);

  useEffect(() => {
    let isMounted = true;
    fetchAddressBook().then((data) => {
      if (isMounted) {
        setBook(data);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return book;
};
