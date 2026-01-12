import "./App.css";
import { Assist } from "./component/Assist";
import { Footer } from "./component/Footer";

function App() {
  return (
    <div id="App">
      <div className="App">
        <h1>Demo</h1>
        <p>Hi, I am Notes Assistant</p>
      </div>
      <Assist />
      <Footer />
    </div>
  );
}

export default App;
