'use strict';

/* ======= Canvas Setup ======= */
/** @type {HTMLCanvasElement} */
const canv = document.getElementById('c');
const ctx = canv.getContext('2d');

const height = 1000;
const actual_height = 768;
let width;


function recalculate_sizing() {
    let actual_width = actual_height * canv.clientWidth / canv.clientHeight;
    canv.width = actual_width;
    canv.height = actual_height;
    width = actual_width * height / actual_height;
}

window.addEventListener('resize', recalculate_sizing);
recalculate_sizing();

/* ======= Utilities ======= */
function lerp(start, end, x) {
    return start + Math.max(0, Math.min(1, x)) * (end - start)
}

const get_time = () => new Date() / 1000;

/* ======= Global Variables ======= */
let elapsed_time = 0;

let player_x = 0;
let cam_x = 0;

let player_y = height / 2;
let grav_direction = 1;
let player_y_velocity = 0;
let forward_velocity = 350;

let obstacle_generation_x = 600;
let difficulty = 0; // [0, 1]

const TOP_BAR = 22;
const SIDE_BARS_WIDTH = 22;

let stage = 0;
let substage = 0;
let stage_start = get_time();
let stage_elapsed = 0;

const player_points = [
    [30, 0],
    [0, -20],
    [-40, -20],
    [-60, -30],
    [-70, -40],
    [-80, -40],
    [-80, -30],
    [-70, -30],
    [-60, -20],
    [-60, 20],
    [-70, 30],
    [-80, 30],
    [-80, 40],
    [-70, 40],
    [-60, 30],
    [-40, 20],
    [0, 20]
];

let exhaust_particles = [];
let last_exhaust_emission = 0;
const time_between_exhausts = 0.2;

const dialogue_box_width = 600;
const dialogue_box_margin = 50;
const dialogue_rate = 0.08;

/* ======= Rendering ======= */
function make_colour_string(r, g, b, a) {
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

let dialogue_lines_done = [''];
let characters_to_add_to_line = [];
let dialogue_words_left = [];

function render() {
    ctx.save();
    ctx.scale(actual_height / height, actual_height / height);
    // Render stars
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);

    for(let i = 0; i < 2e3; ++i) {
        const offset = i ** 4.7;
        const x = (offset * 1.9 % 500) * width / 500;
        const y = (offset % 501) * height / 501;
        ctx.beginPath();
        const r = offset % 6 * Math.sin(i + elapsed_time * (i % 2 ? 0.9 : 0.8)) ** 2
        ctx.arc(x, y, r / 2, 0, Math.PI * 2);
        const c = 42 * r;
        ctx.fillStyle = make_colour_string(c, c, c, c);
        ctx.fill();
    }

    // Render terrain (parallaxed)
    for(let i = 0; i < 70; ++i) {
        const radius = 1000;
        ctx.beginPath();
        const t_val = 1 - i / 70;
        const parallax_movement = -1 * cam_x * Math.pow(1 - t_val, 2);
        const x = ((i + 7) ** 5.1 + parallax_movement) % (2 * width) - width / 2;
        const y_offset = lerp(80, 160, (i + 6) ** 5.5 % 1) + t_val * 60;
        ctx.arc(x, height + radius - y_offset, radius, 0, Math.PI * 2);
        const darkness_multiplier = lerp(1, 0.6, t_val);
        ctx.fillStyle = make_colour_string(
            darkness_multiplier * lerp(250, 250, t_val),
            darkness_multiplier * lerp(90, 175, t_val),
            darkness_multiplier * lerp(62, 62, t_val),
            lerp(1, 1, t_val)
        );
        ctx.fill();
    }

    // Render obstacles
    // Render ship
    exhaust_particles.forEach(particle => {
        ctx.beginPath();
        const time_since_particle = elapsed_time - particle.t;
        ctx.arc(particle.x - cam_x, particle.y, lerp(4, 30, time_since_particle / 2), 0,  Math.PI * 2);
        ctx.fillStyle = make_colour_string(210, lerp(50, 120, time_since_particle), 0, 1);
        ctx.fill();
    });

    if(stage != 0) {
        ctx.save();
        ctx.fillStyle = '#FFF';
        ctx.strokeStyle = '#F8F8F8';
        ctx.translate(player_x - cam_x, player_y);
        ctx.beginPath();
        ctx.moveTo(...player_points[0]);
        player_points.forEach((p, i) => {
            if(i == 0) return;
            ctx.lineTo(...p);
        });
        ctx.closePath();
        ctx.lineJoin = 'round';
        ctx.lineWidth = 5;
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#3BE';
        ctx.fillRect(-8, -8, 10, 16);
        ctx.fillRect(-24, -8, 10, 16);
        ctx.fillRect(-40, -8, 10, 16);
        ctx.restore();
    }

    // Render title
    if(stage == 0) {
        ctx.fillStyle = make_colour_string(255, 255, 255, lerp(0, 1, stage_elapsed / 1 - 1));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'hanging';
        ctx.font = "52px 'Press Start 2P', monospace"
        ctx.fillText("TODO: Find a name for this game", width / 2, 50);

        ctx.fillStyle = make_colour_string(255, 255, 255, lerp(0, 1, stage_elapsed / 1 - 2));
        ctx.font = ctx.font.replace('52', '30');
        ctx.fillText("Press Space to Start", width / 2, 400);
        ctx.fillText("(I'm going to put some interesting stuff here)", width / 2, 600);
    }

    // Render dialogue
    if([1].includes(stage)) {
        let dialogue_window_x = lerp(width, width - dialogue_box_width - dialogue_box_margin, stage_elapsed);
        ctx.fillStyle = '#DDD';
        ctx.fillRect(dialogue_window_x, dialogue_box_margin, dialogue_box_width, height - 2 * dialogue_box_margin);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 10;
        ctx.lineJoin = 'round';
        ctx.strokeRect(dialogue_window_x, dialogue_box_margin, dialogue_box_width, height - 2 * dialogue_box_margin);

        let dialogue_offset = 0;
        dialogue_lines_done.forEach((line, line_num) => {
            ctx.font = "30px 'Press Start 2P', monospace";
            ctx.textAlign = 'left';
            ctx.textBaseline = 'hanging';
            ctx.fillStyle = '#000';
            ctx.fillText(line, dialogue_window_x + 20, dialogue_box_margin + 20 + dialogue_offset);

            const line_measuremnt = ctx.measureText(line);
            dialogue_offset += line_measuremnt.actualBoundingBoxDescent + line_measuremnt.actualBoundingBoxAscent + 9;

            if(line_num == dialogue_lines_done.length - 1 && characters_to_add_to_line.length == 0 && dialogue_words_left.length > 0) {
                const new_line_width = ctx.measureText(line + ' ' + dialogue_words_left[0]).width;
                if(dialogue_words_left[0] == '\n') {
                    dialogue_words_left.shift();
                    dialogue_lines_done.push('');
                } else if(new_line_width < dialogue_box_width - 40) {
                    characters_to_add_to_line = (dialogue_words_left[0] + ' ').split('');
                    dialogue_words_left.shift();
                } else {
                    dialogue_lines_done.push('');
                }
            }
        });
    }

    ctx.restore();
}

/* ======= Updating ======= */
let last_dialogue_character_added = 0;

function add_dialogue(dialogue) {
    dialogue_words_left.push(...dialogue.split(' '));
}
function dialogue_newline() {
    dialogue_words_left.push('\n');
}

function update(dt) {
    elapsed_time += dt;
    stage_elapsed += dt;

    if(stage == 0) return;

    if(elapsed_time - last_exhaust_emission > time_between_exhausts) {
        [-35, 35].forEach(dy => {
            exhaust_particles.push({
                x: player_x - 80,
                y: player_y + dy,
                dx: -5,
                dy: player_y_velocity / 3,
                t: elapsed_time
            });
        });
        last_exhaust_emission = elapsed_time;
    }

    exhaust_particles.forEach(particle => {
        particle.x += particle.dx * dt;
    });

    player_x += forward_velocity * dt;
    cam_x = Math.max(600, player_x) - 600;

    last_dialogue_character_added = Math.max(last_dialogue_character_added, elapsed_time - 3 * dialogue_rate);
    if(characters_to_add_to_line.length && elapsed_time - last_dialogue_character_added > dialogue_rate) {
        last_dialogue_character_added += dialogue_rate;
        dialogue_lines_done[dialogue_lines_done.length - 1] += characters_to_add_to_line[0];
        characters_to_add_to_line.shift();
    }

    if(stage == 1) {
        if(substage == 0 && stage_elapsed > 1) {
            add_dialogue('Hello! I am your onboard ship computer. Standby...');
            dialogue_newline();
            substage = 1;
        } else if(substage == 1 && stage_elapsed > 6) {
            player_x = -600;
            add_dialogue('Alert! Exiting hyperspeed!');
            dialogue_newline();
            add_dialogue("[This is just some test dialogue I haven't done anything beyond this, feedback so far welcome]");
            substage = 2;
        }
    }
}

/* ======= Game Loop ======= */
function set_stage(new_stage) {
    if(stage == 0) {
        player_x = -1e20;
        exhaust_particles = [];
    }

    stage = new_stage;
    substage = 0;
    stage_elapsed = 0;
}

let last_frame_time = get_time();

function frame() {
    const this_frame_time = get_time();
    const dt = Math.max(Math.min(this_frame_time - last_frame_time, 1 / 15), 0);
    last_frame_time = this_frame_time;

    const SUBSTEPS = 1 + Math.ceil(dt / 0.01);
    for(let substep = 0; substep < SUBSTEPS; ++substep) {
        update(dt / SUBSTEPS);
    }

    render();
    requestAnimationFrame(frame);
}

frame();

function space_key_hit() {
    if(stage == 0) {
        set_stage(1);
    }
}

window.addEventListener('keydown', e => {
    if(e.code == 'Space') space_key_hit();
});