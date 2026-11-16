
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080d19);
scene.fog = new THREE.Fog(0x080d19, 30, 85);

const camera = new THREE.PerspectiveCamera(
  65, window.innerWidth / window.innerHeight, 0.1, 150
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x8acfff, 0x171126, 2));

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(10, 20, 10);
scene.add(light);

// ARENA
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.MeshStandardMaterial({
    color: 0x111c2c,
    roughness: 0.85
  })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const grid = new THREE.GridHelper(100, 50, 0x087e9c, 0x24374b);
grid.position.y = 0.02;
scene.add(grid);

// ARENA WALLS
const wallMat = new THREE.MeshStandardMaterial({
  color: 0x17344d,
  emissive: 0x062c40
});

function wall(x, z, sx, sz) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, 4, sz),
    wallMat
  );
  mesh.position.set(x, 2, z);
  scene.add(mesh);
}

wall(0, -25, 50, 1);
wall(0, 25, 50, 1);
wall(-25, 0, 1, 50);
wall(25, 0, 1, 50);

// PLAYER
const player = new THREE.Group();

const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.55, 0.9, 4, 8),
  new THREE.MeshStandardMaterial({
    color: 0x00ccff,
    emissive: 0x004466
  })
);

body.position.y = 1;
player.add(body);

const gun = new THREE.Mesh(
  new THREE.BoxGeometry(0.2, 0.2, 1),
  new THREE.MeshStandardMaterial({ color: 0xccccdd })
);
gun.position.set(0.5, 1.2, -0.5);
player.add(gun);

scene.add(player);
player.position.set(0, 0, 0);

// GAME DATA
let health = 100;
let xp = 0;
let level = 1;
let wave = 1;
let damage = 20;
let fireRate = 450;
let lastShot = 0;
let moveSpeed = 9;
let kills = 0;
let playing = false;
let waveStarting = false;
let mouseDown = false;
let dashCooldown = 0;

let enemies = [];
let bullets = [];
let enemyBullets = [];
let keys = {};

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const groundPlane = new THREE.Plane(
  new THREE.Vector3(0, 1, 0), 0
);
const target = new THREE.Vector3();

// UI
const $ = id => document.getElementById(id);

function updateHUD() {
  $('health').textContent = Math.max(0, Math.ceil(health));
  $('xp').textContent = xp;
  $('level').textContent = level;
  $('wave').textContent = wave;
  $('enemies').textContent = 'ENEMIES: ' + enemies.length;
}

function showOverlay(title, message) {
  $('overlay').style.display = 'flex';
  $('overlayTitle').textContent = title;
  $('overlayText').textContent = message;
}

function hideOverlay() {
  $('overlay').style.display = 'none';
}

// ENEMY CREATION
function spawnEnemy(boss = false) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 20;

  const group = new THREE.Group();

  const material = new THREE.MeshStandardMaterial({
    color: boss ? 0xff2244 : 0xff6633,
    emissive: boss ? 0x880011 : 0x441100
  });

  const mesh = new THREE.Mesh(
    boss
      ? new THREE.DodecahedronGeometry(2)
      : new THREE.BoxGeometry(1.2, 1.5, 1.2),
    material
  );

  mesh.position.y = boss ? 2 : 0.8;
  group.add(mesh);

  const enemy = {
    group,
    mesh,
    boss,
    hp: boss ? 600 + wave * 100 : 40 + wave * 9,
    speed: boss ? 2 : 2.5 + wave * 0.08,
    attackTimer: 0,
    radius: boss ? 2 : 0.8
  };

  group.position.set(
    Math.cos(angle) * radius,
    0,
    Math.sin(angle) * radius
  );

  scene.add(group);
  enemies.push(enemy);
}

// SHOOTING
function shoot() {
  if (!playing || Date.now() - lastShot < fireRate) return;
  if (!mouseDown) return;

  lastShot = Date.now();

  raycaster.setFromCamera(mouse, camera);

  const direction = target.clone().sub(player.position);
  direction.y = 0.7;
  direction.normalize();

  const projectile = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x00ffff })
  );

  projectile.position.copy(player.position);
  projectile.position.y = 1.2;

  scene.add(projectile);

  bullets.push({
    mesh: projectile,
    direction,
    damage
  });
}

// ENEMY ATTACK
function enemyShoot(enemy) {
  const direction = player.position.clone()
    .sub(enemy.group.position);
  direction.y = 0;
  direction.normalize();

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3344 })
  );

  mesh.position.copy(enemy.group.position);
  mesh.position.y = 1;

  scene.add(mesh);

  enemyBullets.push({
    mesh,
    direction,
    damage: enemy.boss ? 15 : 8
  });
}

// XP AND LEVELS
function addXP(amount) {
  xp += amount;

  if (xp >= level * 30) {
    xp -= level * 30;
    level++;
    showUpgrade();
  }

  updateHUD();
}

// RANDOM UPGRADES
const upgrades = [
  {
    name: 'Heavy Bullets',
    description: '+25% weapon damage',
    apply: () => damage *= 1.25
  },
  {
    name: 'Rapid Fire',
    description: '+25% firing speed',
    apply: () => fireRate *= 0.75
  },
  {
    name: 'Reinforced Armor',
    description: '+30 maximum health',
    apply: () => health += 30
  },
  {
    name: 'Speed Boost',
    description: '+20% movement speed',
    apply: () => moveSpeed *= 1.2
  },
  {
    name: 'Critical Rounds',
    description: '+15% weapon damage',
    apply: () => damage *= 1.15
  },
  {
    name: 'Regeneration',
    description: 'Restore 40 health',
    apply: () => health = Math.min(100, health + 40)
  },
  {
    name: 'Overcharged',
    description: 'Double damage',
    apply: () => damage *= 2
  },
  {
    name: 'Quick Hands',
    description: 'Increase firing speed',
    apply: () => fireRate *= 0.6
  }
];

function showUpgrade() {
  playing = false;
  showOverlay('LEVEL UP!', 'Choose one upgrade');

  const choices = $('choices');
  choices.innerHTML = '';

  const shuffled = [...upgrades].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 3);

  selected.forEach(upgrade => {
    const button = document.createElement('button');
    button.innerHTML =
      `<strong>${upgrade.name}</strong><br><br>${upgrade.description}`;

    button.onclick = () => {
      upgrade.apply();
      choices.innerHTML = '';
      hideOverlay();
      playing = true;
      updateHUD();
    };

    choices.appendChild(button);
  });

  $('startButton').style.display = 'none';
}

// WAVES
function startWave() {
  if (waveStarting || !playing) return;

  waveStarting = true;

  const bossWave = wave % 5 === 0;

  if (bossWave) {
    spawnEnemy(true);
  } else {
    const count = 4 + wave * 2;

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (playing) spawnEnemy(false);
      }, i * 500);
    }
  }

  setTimeout(() => {
    waveStarting = false;
  }, 3000);
}

// DEATH
function gameOver() {
  playing = false;
  showOverlay('YOU DIED', `You survived ${wave} waves and killed ${kills} enemies.`);
  $('startButton').textContent = 'PLAY AGAIN';
  $('startButton').style.display = 'block';
  $('choices').innerHTML = '';
}

// INPUT
window.addEventListener('keydown', e => {
  keys[e.code] = true;

  if (e.code === 'Space' && dashCooldown <= 0 && playing) {
    const direction = new THREE.Vector3(
      Number(keys.KeyD) - Number(keys.KeyA),
      0,
      Number(keys.KeyS) - Number(keys.KeyW)
    ).normalize();

    if (direction.length() > 0) {
      player.position.addScaledVector(direction, 4);
      dashCooldown = 2;
    }
  }
});

window.addEventListener('keyup', e => {
  keys[e.code] = false;
});

window.addEventListener('mousemove', e => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
});

window.addEventListener('mousedown', () => mouseDown = true);
window.addEventListener('mouseup', () => mouseDown = false);

// CAMERA AND AIM
function updateCamera() {
  camera.position.set(
    player.position.x,
    player.position.y + 13,
    player.position.z + 12
  );

  camera.lookAt(
    player.position.x,
    0,
    player.position.z
  );

  raycaster.setFromCamera(mouse, camera);
  raycaster.ray.intersectPlane(groundPlane, target);

  if (target) {
    player.lookAt(target.x, player.position.y, target.z);
  }
}

// MAIN GAME LOOP
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  if (playing) {
    // MOVEMENT
    const direction = new THREE.Vector3(
      Number(keys.KeyD) - Number(keys.KeyA),
      0,
      Number(keys.KeyS) - Number(keys.KeyW)
    );

    if (direction.length() > 0) {
      direction.normalize();
      player.position.addScaledVector(direction, moveSpeed * dt);
    }

    player.position.x = THREE.MathUtils.clamp(
      player.position.x, -23, 23
    );
    player.position.z = THREE.MathUtils.clamp(
      player.position.z, -23, 23
    );

    dashCooldown = Math.max(0, dashCooldown - dt);

    updateCamera();
    shoot();

    // BULLETS
    bullets.forEach((bullet, i) => {
      bullet.mesh.position.addScaledVector(
        bullet.direction, 35 * dt
      );

      enemies.forEach(enemy => {
        if (enemy.hp <= 0) return;

        if (bullet.mesh.position.distanceTo(
          enemy.group.position.clone().add(
            new THREE.Vector3(0, 1, 0)
          )
        ) < enemy.radius + 0.5) {
          enemy.hp -= bullet.damage;
          bullet.mesh.position.set(999, 999, 999);

          if (enemy.hp <= 0) {
            scene.remove(enemy.group);
            kills++;
            addXP(enemy.boss ? 100 : 10);
          }
        }
      });

      if (bullet.mesh.position.length() > 70) {
        scene.remove(bullet.mesh);
      }
    });

    bullets = bullets.filter(
      b => b.mesh.position.length() <= 70
    );

    enemies = enemies.filter(e => e.hp > 0);

    // ENEMY AI
    enemies.forEach(enemy => {
      const toPlayer = player.position.clone()
        .sub(enemy.group.position);

      const distance = toPlayer.length();

      toPlayer.normalize();

      if (distance > (enemy.boss ? 4 : 1.5)) {
        enemy.group.position.addScaledVector(
          toPlayer, enemy.speed * dt
        );
      }

      enemy.group.lookAt(player.position.x, 0, player.position.z);

      enemy.attackTimer -= dt;

      if (enemy.attackTimer <= 0 && distance < 16) {
        enemyShoot(enemy);
        enemy.attackTimer = enemy.boss ? 1.2 : 2.5;
      }

      if (distance < enemy.radius + 0.8) {
        health -= (enemy.boss ? 20 : 12) * dt;
      }
    });

    // ENEMY PROJECTILES
    enemyBullets.forEach(b => {
      b.mesh.position.addScaledVector(b.direction, 12 * dt);

      if (b.mesh.position.distanceTo(
        player.position.clone().add(new THREE.Vector3(0, 1, 0))
      ) < 1) {
        health -= b.damage;
        b.mesh.position.set(999, 999, 999);
      }
    });

    enemyBullets = enemyBullets.filter(b => {
      if (b.mesh.position.length() > 60 ||
          b.mesh.position.length() > 900) {
        scene.remove(b.mesh);
        return false;
      }
      return true;
    });

    // AUTOMATIC WAVE PROGRESSION
    if (enemies.length === 0 && !waveStarting) {
      wave++;
      updateHUD();
      startWave();
    }

    if (health <= 0) gameOver();

    updateHUD();
  } else {
    updateCamera();
  }

  renderer.render(scene, camera);
}

// RESET
function resetGame() {
  enemies.forEach(e => scene.remove(e.group));
  bullets.forEach(b => scene.remove(b.mesh));
  enemyBullets.forEach(b => scene.remove(b.mesh));

  enemies = [];
  bullets = [];
  enemyBullets = [];

  health = 100;
  xp = 0;
  level = 1;
  wave = 1;
  damage = 20;
  fireRate = 450;
  moveSpeed = 9;
  kills = 0;
  waveStarting = false;
  dashCooldown = 0;

  player.position.set(0, 0, 0);

  $('startButton').style.display = 'block';
  $('startButton').textContent = 'START GAME';

  hideOverlay();
  playing = true;

  updateHUD();
  startWave();
}

$('startButton').addEventListener('click', resetGame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

updateHUD();
updateCamera();
animate();
