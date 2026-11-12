# Projekte & Git

Ein **Projekt** ist ein Git-Repository auf einem deiner Server. Es verbindet einen gespeicherten SSH-Host, den Repository-Pfad auf diesem Host und optional ein Docker-Compose-Projekt in einer Ansicht.

![Projektansicht mit hervorgehobenem Code](/screenshots/projects-git.png)

## Ein Projekt anlegen

Lege ein Projekt mit Name, Host, Repository-Pfad und optional dem Namen des Compose-Projekts an. OwnShell kann auch Projekte aus den Compose-Labels laufender Container auf einem Host vorschlagen.

## So funktioniert es

Alle Git-Befehle laufen **auf dem Server** über SSH (`git -C <path> …`). Nichts wird auf deinen Mac geklont, und du brauchst `git` auf dem Server. Die **Übersicht** zeigt kopierfertige `git clone ssh://…`- und `git remote add`-Befehle, falls du eine lokale Kopie möchtest.

## Bereiche

- **Übersicht**: aktueller Branch (oder Detached HEAD), Upstream mit Ahead/Behind-Zählern, geänderte Dateien und der letzte Commit.
- **Code**: Dateibaum und Dateien mit Syntax-Highlighting aus dem **committeten `HEAD`** (keine nicht committeten Änderungen). ⌘P öffnet die Schnellsuche, ⌘F sucht in der Datei. Dateien bis 1 MB werden angezeigt.
- **Änderungen**: der Diff des Arbeitsverzeichnisses in Unified- oder Split-Ansicht, mit Syntax-Highlighting und Markierungen auf Wortebene. Stage und Unstage Dateien und committe mit einer Nachricht.
- **Verlauf**: Commits, 50 pro Seite, durchsuchbar nach Nachricht oder Autor. Öffne einen Commit, um die geänderten Dateien und seinen Diff zu sehen.
- **Branches**: lokale und Remote-Branches mit Ahead/Behind-Zählern. Branches erstellen, wechseln und löschen. Das Auschecken eines Remote-Branches erstellt einen lokalen Tracking-Branch. Zum Wechseln muss das Arbeitsverzeichnis sauber sein.

![Split-Diff mit Hervorhebung auf Wortebene](/screenshots/projects-diff.png)

OwnShell führt kein Push, Pull, Fetch oder Merge aus. Das erledigst du im Terminal.

Gibt es unter dem Pfad noch kein Repository, kann OwnShell dort `git init` (Branch `main`) ausführen.

## Compose-Status

Ist ein Compose-Projekt gesetzt, zeigt das Projekt, wie viele seiner Container laufen. Ein Button springt zum Tab **Docker** des Hosts.
