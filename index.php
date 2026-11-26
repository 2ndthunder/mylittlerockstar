<?php declare(strict_types=1); ?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My Little Rockstar</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎸</text></svg>">
  <link rel="stylesheet" href="assets/css/style.css?v=1">
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <div id="announcer" class="sr-only" aria-live="polite"></div>
  <header id="topbar" hidden></header>
  <main id="main" tabindex="-1"></main>
  <div id="overlay" hidden></div>
  <dialog id="modal" aria-labelledby="modalTitle"><div class="modal-body"></div></dialog>
  <div id="toasts" aria-hidden="true"></div>
  <script src="assets/js/avatar.js?v=1"></script>
  <script src="assets/js/stage.js?v=1"></script>
  <script src="assets/js/creator.js?v=1"></script>
  <script src="assets/js/app.js?v=1"></script>
</body>
</html>
