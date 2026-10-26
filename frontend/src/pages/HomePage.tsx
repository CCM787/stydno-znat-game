import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

export default function HomePage() {
  useEffect(() => {
    document.title = 'Стыдно знать';
  }, []);

  return (
    <div className="home-page">
      <div className="box">
        <h1>
          СТЫДНО <span>ЗНАТЬ</span>
        </h1>
        <Link to="/screen">
          Экран для всех
          <small>откройте на телевизоре или большом мониторе</small>
        </Link>
        <Link to="/host">
          Пульт ведущего
          <small>ваш телефон: ответы, баллы, ход игры</small>
        </Link>
        <Link to="/player">
          Экран игрока
          <small>телефон игрока</small>
        </Link>
        <Link to="/builder">
          Конструктор вопросов
          <small>добавляйте вопросы в банк, собирайте игры</small>
        </Link>
      </div>
    </div>
  );
}
