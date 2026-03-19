/**
 * Flappy Bird — TypeScript IL game spec using @engine SDK.
 *
 * AI-controlled bird navigates through pipe gaps.
 * Uses continuous physics with gravity for bird movement.
 */

import { defineGame } from '@engine/core';
import { consumeAction } from '@engine/input';
import {
  clearCanvas, drawRoundedRect, drawCircle,
  drawLabel, drawGameOver,
} from '@engine/render';
import { drawTouchOverlay } from '@engine/touch';
import { applyGravityForce, clamp } from '@engine/physics';

// ── Constants ───────────────────────────────────────────────────────

const W = 400;
const H = 600;
const GRAVITY = 0.0012;
const FLAP_IMPULSE = -0.35;
const BIRD_RADIUS = 15;
const BIRD_X = 80;
const PIPE_WIDTH = 52;
const GROUND_HEIGHT = 50;
const GROUND_Y = H - GROUND_HEIGHT;

// ── Game Definition ─────────────────────────────────────────────────

const game = defineGame({
  display: {
    type: 'custom',
    width: 13,
    height: 20,
    cellSize: 30,
    canvasWidth: W,
    canvasHeight: H,
    offsetX: 0,
    offsetY: 0,
    background: '#70c5ce',
  },
  input: {
    select:  { keys: [' ', 'Enter'] },
    restart: { keys: ['r', 'R'] },
  },
});

// ── Resources ───────────────────────────────────────────────────────

game.resource('state', {
  score: 0,
  gameOver: false,
  started: false,
  bestScore: 0,
  message: 'Tap to start',
});

game.resource('bird', {
  x: BIRD_X,
  y: 300,
  dy: 0,
  radius: BIRD_RADIUS,
});

game.resource('pipes', {
  list: [],
  spawnTimer: 0,
  spawnInterval: 1800,
  gapSize: 150,
  speed: 2.5,
});

game.resource('_aiTimer', { elapsed: 0 });

// ── Input System ────────────────────────────────────────────────────

game.system('input', function inputSystem(world, _dt) {
  const input = world.getResource('input');
  const state = world.getResource('state');
  const bird = world.getResource('bird');
  const pipes = world.getResource('pipes');

  // Restart on game over
  if (state.gameOver && consumeAction(input, 'restart')) {
    state.score = 0;
    state.gameOver = false;
    state.started = false;
    state.message = 'Tap to start';
    bird.y = 300;
    bird.dy = 0;
    pipes.list = [];
    pipes.spawnTimer = 0;
    return;
  }

  // In AI mode, skip player input
  const gm = world.getResource('gameMode');
  if (!gm || gm.mode !== 'playerVsAi') return;

  if (state.gameOver) return;

  // Flap
  if (consumeAction(input, 'select')) {
    if (!state.started) {
      state.started = true;
      state.message = '';
    }
    bird.dy = FLAP_IMPULSE;
  }
});

// ── AI System ───────────────────────────────────────────────────────

const AI_REACTION_MS = 120;

game.system('ai', function aiSystem(world, dt) {
  // In player vs AI mode, player controls the bird
  const gm = world.getResource('gameMode');
  if (gm && gm.mode === 'playerVsAi') return;

  const state = world.getResource('state');
  if (state.gameOver) return;

  const timer = world.getResource('_aiTimer');
  timer.elapsed += dt;

  // Auto-start the game
  if (!state.started) {
    if (timer.elapsed > 500) {
      state.started = true;
      state.message = '';
      timer.elapsed = 0;
    }
    return;
  }

  if (timer.elapsed < AI_REACTION_MS) return;
  timer.elapsed = 0;

  const bird = world.getResource('bird');
  const pipes = world.getResource('pipes');

  // Find the next pipe ahead of the bird
  let nextPipe = null;
  for (const pipe of pipes.list) {
    if (pipe.x + PIPE_WIDTH > bird.x - BIRD_RADIUS) {
      nextPipe = pipe;
      break;
    }
  }

  if (nextPipe) {
    const gapCenter = nextPipe.gapY + pipes.gapSize / 2;
    // Add slight randomness for natural movement
    const jitter = (Math.random() - 0.5) * 20;
    const targetY = gapCenter + jitter;

    // Flap if bird is below the target
    if (bird.y > targetY - 10) {
      bird.dy = FLAP_IMPULSE;
    }
  } else {
    // No pipes visible — stay near center
    if (bird.y > H * 0.4) {
      bird.dy = FLAP_IMPULSE;
    }
  }
});

// ── Physics System ──────────────────────────────────────────────────

game.system('physics', function physicsSystem(world, dt) {
  const state = world.getResource('state');
  if (state.gameOver || !state.started) return;

  const bird = world.getResource('bird');
  const pipes = world.getResource('pipes');

  // Apply gravity
  bird.dy += GRAVITY * dt;

  // Clamp terminal velocity
  bird.dy = clamp(bird.dy, -0.6, 0.8);

  // Update bird position
  bird.y += bird.dy * dt;

  // Move pipes
  const pipeMove = pipes.speed * (dt / 16);
  for (const pipe of pipes.list) {
    pipe.x -= pipeMove;
  }
});

// ── Pipe Spawner System ─────────────────────────────────────────────

game.system('pipeSpawner', function pipeSpawnerSystem(world, dt) {
  const state = world.getResource('state');
  if (state.gameOver || !state.started) return;

  const pipes = world.getResource('pipes');
  pipes.spawnTimer += dt;

  if (pipes.spawnTimer >= pipes.spawnInterval) {
    pipes.spawnTimer -= pipes.spawnInterval;

    // Random gap position
    const minGapY = 100;
    const maxGapY = H - GROUND_HEIGHT - pipes.gapSize - 100;
    const gapY = minGapY + Math.random() * (maxGapY - minGapY);

    pipes.list.push({
      x: W + 10,
      gapY: gapY,
      scored: false,
    });
  }

  // Remove pipes that scrolled off screen
  pipes.list = pipes.list.filter(p => p.x + PIPE_WIDTH > -10);
});

// ── Collision System ────────────────────────────────────────────────

game.system('collision', function collisionSystem(world, _dt) {
  const state = world.getResource('state');
  if (state.gameOver || !state.started) return;

  const bird = world.getResource('bird');
  const pipes = world.getResource('pipes');

  // Ground collision
  if (bird.y + BIRD_RADIUS > GROUND_Y) {
    bird.y = GROUND_Y - BIRD_RADIUS;
    state.gameOver = true;
    if (state.score > state.bestScore) state.bestScore = state.score;
    return;
  }

  // Ceiling collision
  if (bird.y - BIRD_RADIUS < 0) {
    bird.y = BIRD_RADIUS;
    bird.dy = 0;
  }

  // Pipe collisions
  for (const pipe of pipes.list) {
    // Check if bird overlaps pipe horizontally
    const pipeLeft = pipe.x;
    const pipeRight = pipe.x + PIPE_WIDTH;

    if (bird.x + BIRD_RADIUS > pipeLeft && bird.x - BIRD_RADIUS < pipeRight) {
      // Top pipe: from 0 to gapY
      if (bird.y - BIRD_RADIUS < pipe.gapY) {
        state.gameOver = true;
        if (state.score > state.bestScore) state.bestScore = state.score;
        return;
      }
      // Bottom pipe: from gapY + gapSize to ground
      if (bird.y + BIRD_RADIUS > pipe.gapY + pipes.gapSize) {
        state.gameOver = true;
        if (state.score > state.bestScore) state.bestScore = state.score;
        return;
      }
    }

    // Score when bird passes a pipe
    if (!pipe.scored && pipe.x + PIPE_WIDTH < bird.x - BIRD_RADIUS) {
      pipe.scored = true;
      state.score++;
    }
  }
});

// ── Render System ───────────────────────────────────────────────────

function drawPipe(ctx, x, topY, bottomY, width) {
  const pipeColor = '#2ecc71';
  const pipeDark = '#27ae60';
  const capHeight = 26;
  const capOverhang = 4;

  // Top pipe body
  if (topY > 0) {
    drawRoundedRect(ctx, x, 0, width, topY, 0, pipeColor);
    // Darker edges
    ctx.fillStyle = pipeDark;
    ctx.fillRect(x, 0, 3, topY);
    ctx.fillRect(x + width - 3, 0, 3, topY);
    // Cap at bottom of top pipe
    drawRoundedRect(ctx, x - capOverhang, topY - capHeight, width + capOverhang * 2, capHeight, 3, pipeColor);
    ctx.fillStyle = pipeDark;
    ctx.fillRect(x - capOverhang, topY - capHeight, 3, capHeight);
    ctx.fillRect(x + width + capOverhang - 3, topY - capHeight, 3, capHeight);
  }

  // Bottom pipe body
  if (bottomY < GROUND_Y) {
    const bpHeight = GROUND_Y - bottomY;
    drawRoundedRect(ctx, x, bottomY, width, bpHeight, 0, pipeColor);
    // Darker edges
    ctx.fillStyle = pipeDark;
    ctx.fillRect(x, bottomY, 3, bpHeight);
    ctx.fillRect(x + width - 3, bottomY, 3, bpHeight);
    // Cap at top of bottom pipe
    drawRoundedRect(ctx, x - capOverhang, bottomY, width + capOverhang * 2, capHeight, 3, pipeColor);
    ctx.fillStyle = pipeDark;
    ctx.fillRect(x - capOverhang, bottomY, 3, capHeight);
    ctx.fillRect(x + width + capOverhang - 3, bottomY, 3, capHeight);
  }
}

function drawBird(ctx, x, y, radius, dy) {
  // Body
  const bodyColor = '#f1c40f';
  const bodyDark = '#e67e22';
  drawCircle(ctx, x, y, radius, bodyColor, { strokeColor: bodyDark, strokeWidth: 2 });

  // Wing
  const wingY = y + 2;
  const wingFlap = Math.sin(Date.now() / 80) * 4;
  ctx.fillStyle = '#e67e22';
  ctx.beginPath();
  ctx.ellipse(x - 6, wingY + wingFlap, 10, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eye (white part)
  const eyeX = x + 6;
  const eyeY = y - 4;
  drawCircle(ctx, eyeX, eyeY, 5, '#fff', { strokeColor: '#333', strokeWidth: 1 });
  // Pupil
  drawCircle(ctx, eyeX + 2, eyeY, 2.5, '#333');

  // Beak
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.moveTo(x + radius - 2, y - 2);
  ctx.lineTo(x + radius + 10, y + 2);
  ctx.lineTo(x + radius - 2, y + 5);
  ctx.closePath();
  ctx.fill();

  // Rotation hint: tilt based on velocity
  // (Visual only — we draw the bird rotated slightly)
}

function drawGround(ctx) {
  // Main ground
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(0, GROUND_Y, W, GROUND_HEIGHT);

  // Grass strip on top
  ctx.fillStyle = '#4CAF50';
  ctx.fillRect(0, GROUND_Y, W, 8);

  // Grass detail
  ctx.fillStyle = '#388E3C';
  for (let gx = 0; gx < W; gx += 20) {
    ctx.fillRect(gx, GROUND_Y, 10, 4);
  }

  // Dirt texture lines
  ctx.fillStyle = '#6D3A1A';
  for (let gx = 5; gx < W; gx += 30) {
    ctx.fillRect(gx, GROUND_Y + 15, 14, 3);
  }
  for (let gx = 18; gx < W; gx += 30) {
    ctx.fillRect(gx, GROUND_Y + 30, 10, 3);
  }
}

function drawClouds(ctx) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  const clouds = [
    { x: 50, y: 60, r: 25 },
    { x: 80, y: 55, r: 30 },
    { x: 110, y: 62, r: 22 },
    { x: 250, y: 100, r: 20 },
    { x: 275, y: 95, r: 28 },
    { x: 300, y: 102, r: 18 },
    { x: 160, y: 40, r: 15 },
    { x: 180, y: 35, r: 20 },
    { x: 350, y: 50, r: 22 },
    { x: 375, y: 45, r: 18 },
  ];
  for (const c of clouds) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

game.system('render', function renderSystem(world, _dt) {
  const renderer = world.getResource('renderer');
  if (!renderer) return;

  const { ctx } = renderer;
  const state = world.getResource('state');
  const bird = world.getResource('bird');
  const pipes = world.getResource('pipes');

  // Sky background
  clearCanvas(ctx, '#70c5ce');

  // Clouds
  drawClouds(ctx);

  // Pipes
  for (const pipe of pipes.list) {
    const topY = pipe.gapY;
    const bottomY = pipe.gapY + pipes.gapSize;
    drawPipe(ctx, pipe.x, topY, bottomY, PIPE_WIDTH);
  }

  // Ground
  drawGround(ctx);

  // Bird — rotate based on velocity
  ctx.save();
  ctx.translate(bird.x, bird.y);
  const angle = clamp(bird.dy * 2.5, -0.5, 1.2);
  ctx.rotate(angle);
  ctx.translate(-bird.x, -bird.y);
  drawBird(ctx, bird.x, bird.y, bird.radius, bird.dy);
  ctx.restore();

  // Score display
  if (state.started) {
    // Score shadow
    drawLabel(ctx, `${state.score}`, W / 2 + 2, 62, {
      color: 'rgba(0,0,0,0.3)',
      fontSize: 48,
      align: 'center',
      fontWeight: 'bold',
    });
    // Score text
    drawLabel(ctx, `${state.score}`, W / 2, 60, {
      color: '#fff',
      fontSize: 48,
      align: 'center',
      fontWeight: 'bold',
    });
  }

  // Start message
  if (!state.started && !state.gameOver) {
    drawLabel(ctx, state.message, W / 2, H / 2 - 60, {
      color: '#fff',
      fontSize: 28,
      align: 'center',
      fontWeight: 'bold',
    });
    drawLabel(ctx, 'Press SPACE to flap', W / 2, H / 2 - 25, {
      color: 'rgba(255,255,255,0.7)',
      fontSize: 16,
      align: 'center',
    });
  }

  // Game over
  if (state.gameOver) {
    drawGameOver(ctx, 0, 0, W, H, {
      title: 'GAME OVER',
      titleColor: '#E53935',
      subtitle: `Score: ${state.score} | Best: ${state.bestScore} | Press R`,
    });
  }

  drawTouchOverlay(ctx, ctx.canvas.width, ctx.canvas.height);
});

export default game;
