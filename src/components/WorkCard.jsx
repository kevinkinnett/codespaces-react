import { useState } from 'react';
import { translate } from '../utils/translator.js';

export default function WorkCard({ work }) {
  const [translation, setTranslation] = useState('');

  const handleTranslate = () => {
    const result = translate(work.original);
    setTranslation(result);
  };

  return (
    <div className="work-card">
      <h3>{work.title}</h3>
      <p className="original-text">{work.original}</p>
      <button onClick={handleTranslate}>Translate</button>
      {translation && <p className="translation">{translation}</p>}
    </div>
  );
}
