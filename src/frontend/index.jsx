import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { invoke } from "@forge/bridge";

const App = () => {
  const [content, setContent] = useState("");

  useEffect(() => {
    invoke("main").then((data) => setContent(data));
  }, []);

  return (
    <div>
      <h2>Release Checkbox</h2>
      <p>Content: {JSON.stringify(content)}</p>
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById("root"));
