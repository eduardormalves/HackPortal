CREATE TABLE aluno (
  ID_aluno int NOT NULL AUTO_INCREMENT,
  nome varchar(255) NOT NULL,
  matricula char(9) NOT NULL,
  nascimento date NOT NULL,
  email_edu varchar(255) NOT NULL,
  senha varchar(255) NOT NULL,
  curso varchar(50) NOT NULL,
  coins int NOT NULL DEFAULT 0,
  PRIMARY KEY (ID_aluno)
);

CREATE TABLE professor (
  ID_professor int NOT NULL AUTO_INCREMENT,
  nome varchar(255) NOT NULL,
  matricula char(9) NOT NULL,
  nascimento date NOT NULL,
  email_edu varchar(255) NOT NULL,
  senha varchar(255) NOT NULL,
  PRIMARY KEY (ID_professor)
);

CREATE TABLE hackton (
  id_hackton int NOT NULL AUTO_INCREMENT,
  nome varchar(255) NOT NULL,
  data_inscricao_max date NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  local varchar(255) NOT NULL,
  status enum('Em Aberto','Em Andamento','Fechado','Finalizado') DEFAULT NULL,
  fk_professor int NOT NULL,
  PRIMARY KEY (id_hackton),
  KEY fk_professor (fk_professor),
  CONSTRAINT hackton_ibfk_1 FOREIGN KEY (fk_professor) REFERENCES professor (ID_professor)
);

CREATE TABLE participacao (
  ID_participacao int NOT NULL AUTO_INCREMENT,
  id_aluno int NOT NULL,
  id_hackton int NOT NULL,
  status enum('Inscrito','Participando','Concluído') NOT NULL DEFAULT 'Inscrito',
  data_inscricao date DEFAULT NULL,
  PRIMARY KEY (ID_participacao),
  KEY idx_aluno (id_aluno),
  KEY idx_hackton (id_hackton),
  CONSTRAINT participacao_ibfk_1 FOREIGN KEY (id_aluno) REFERENCES aluno (ID_aluno),
  CONSTRAINT participacao_ibfk_2 FOREIGN KEY (id_hackton) REFERENCES hackton (id_hackton)
);
CREATE TABLE foto (
  id_foto int NOT NULL AUTO_INCREMENT,
  aluno_id int NOT NULL,
  caminho varchar(255) NOT NULL,
  data_envio timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  hackton_id int DEFAULT NULL,
  status enum('Pendente','Aprovado','Recusado') DEFAULT 'Pendente',
  PRIMARY KEY (id_foto),
  KEY aluno_id (aluno_id),
  KEY fk_foto_hackton (hackton_id),
  CONSTRAINT fk_foto_hackton FOREIGN KEY (hackton_id) REFERENCES hackton (id_hackton),
  CONSTRAINT foto_ibfk_1 FOREIGN KEY (aluno_id) REFERENCES aluno (ID_aluno)
);