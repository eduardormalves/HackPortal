CREATE TABLE aluno (
    ID_aluno INT NOT NULL AUTO_INCREMENT,
    nome VARCHAR(255) NOT NULL,
    matricula CHAR(9) NOT NULL,
    nascimento DATE NOT NULL,
    email_edu VARCHAR(255) NOT NULL,
    senha VARCHAR(255) NOT NULL,
    curso VARCHAR(50) NOT NULL,
    coins INT NOT NULL DEFAULT 0,
    PRIMARY KEY (ID_aluno)
);

CREATE TABLE professor (
    ID_professor INT NOT NULL AUTO_INCREMENT,
    nome VARCHAR(255) NOT NULL,
    matricula CHAR(9) NOT NULL,
    nascimento DATE NOT NULL,
    email_edu VARCHAR(255) NOT NULL,
    senha VARCHAR(255) NOT NULL,
    PRIMARY KEY (ID_professor)
);

CREATE TABLE hackton (
  id_hackton INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  data_inscricao_max DATE NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  local VARCHAR(255) NOT NULL,
  status ENUM('Em Aberto', 'Em Andamento', 'Fechado') NOT NULL DEFAULT 'Em Aberto',
  fk_professor INT NOT NULL,
  FOREIGN KEY (fk_professor) REFERENCES professor(ID_professor)
);

CREATE TABLE participacao (
    ID_participacao INT AUTO_INCREMENT PRIMARY KEY,
    aluno_id INT NOT NULL,
    hackton_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (aluno_id) REFERENCES aluno(ID_aluno),
    FOREIGN KEY (hackton_id) REFERENCES hackton(id_hackton)
);
