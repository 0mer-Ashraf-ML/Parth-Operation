"use client";

import { ToastContainer as ReactToastifyContainer } from "react-toastify";

export default function ToastContainer() {
  return (
    <ReactToastifyContainer
      position="top-right"
      autoClose={3000}
      hideProgressBar={false}
      newestOnTop={false}
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      theme="dark"
    />
  );
}
