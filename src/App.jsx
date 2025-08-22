import './App.css';
import WorkCard from './components/WorkCard.jsx';
import { works } from './data/works.js';

function App() {
  return (
    <div className="App">
      <header className="site-header">
        <h1>Origen Translations</h1>
        <p className="tagline">Machine-translated access to the overlooked writings of Origen.</p>
      </header>
      <main className="content">
        {works.map((w) => (
          <WorkCard key={w.id} work={w} />
        ))}
      </main>
      <footer className="footer">
        Sources are in the public domain. Translations are machine generated.
      </footer>
    </div>
  );
}

export default App;
