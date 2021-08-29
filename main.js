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

let last_explosion_time = -Infinity;

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

const dialogue_box_width = 700;
const dialogue_box_margin = 50;
const dialogue_rate = 0.08;

let skip_dialogue_pressed = false;

/* ======= Rendering ======= */
function make_colour_string(r, g, b, a) {
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

let dialogue_lines_done = [];
let characters_to_add_to_line = [];
let dialogue_words_left = [];
let start_of_empty_dialogue = Infinity;
const stages_with_dialogue_screen = [1];
let can_skip_dialogue = true;
let need_space_to_proceed = false;

function dialogue_done_running() {
    return dialogue_lines_done.length && !characters_to_add_to_line.length && !dialogue_words_left.length;
}

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
        const parallax_movement = -1 * cam_x * Math.pow(1.4 * (1 - t_val), 2);
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
        let explosion_t = (Math.sin(elapsed_time * Math.PI * 2 * 5) + 1) / 2 * lerp(1, 0, (elapsed_time - last_explosion_time) / 3);
        ctx.fillStyle = make_colour_string(
            lerp(255, 176, explosion_t),
            lerp(255, 12, explosion_t),
            lerp(255, 12, explosion_t),
            1
        );
        ctx.strokeStyle = make_colour_string(
            lerp(240, 176, explosion_t),
            lerp(240, 12, explosion_t),
            lerp(240, 12, explosion_t),
            1
        );
        ctx.translate(
            player_x - cam_x + lerp(40, 0, (elapsed_time - last_explosion_time) / 3) * Math.random(),
            player_y + lerp(20, 0, (elapsed_time - last_explosion_time) / 3) * Math.random(),
        );
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
        ctx.fillText("Press [SPACE] to Start", width / 2, 400);
        ctx.fillText("(I'm going to put some interesting stuff here)", width / 2, 600);
    }

    // Render dialogue
    if(stages_with_dialogue_screen.includes(stage)) {
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

            const line_measuremnt = ctx.measureText(line + "|");
            dialogue_offset += line_measuremnt.actualBoundingBoxDescent + line_measuremnt.actualBoundingBoxAscent + 9;

            if(line_num == dialogue_lines_done.length - 1 && characters_to_add_to_line.length == 0 && dialogue_words_left.length > 0) {
                const new_line_width = ctx.measureText(line + ' ' + dialogue_words_left[0]).width;
                if(dialogue_words_left[0] == '\n') {
                    dialogue_words_left.shift();
                    dialogue_lines_done.push('');
                } else if(new_line_width < dialogue_box_width - 40) {
                    if(dialogue_words_left[0] != '#') {
                        characters_to_add_to_line = (dialogue_words_left[0] + ' ').split('');
                    } else {
                        characters_to_add_to_line = ['#'];
                    }
                    dialogue_words_left.shift();
                } else {
                    dialogue_lines_done.push('');
                }
            }
        });
        if(dialogue_done_running() && need_space_to_proceed) {
            ctx.font = "italic 20px 'Press Start 2P', monospace";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = '#000';
            ctx.fillText('[SPACE] to continue', dialogue_window_x + dialogue_box_width / 2, height - dialogue_box_margin - 20);
        }
    }

    ctx.restore();
}

/* ======= Audio ======= */
/** @type {AudioContext} */
let audio_ctx;
let dialogue_beep;
let dialogue_beep_gain;

function init_audio() {
    audio_ctx = new AudioContext();

    dialogue_beep = audio_ctx.createOscillator();
    dialogue_beep.type = 'triangle';
    dialogue_beep_gain = audio_ctx.createGain();
    dialogue_beep_gain.gain.value = 0;
    dialogue_beep.connect(dialogue_beep_gain).connect(audio_ctx.destination);
    dialogue_beep.start();
}

function do_audio_beep() {
    const dialogue_beep_duration = 0.02;

    dialogue_beep.frequency.setValueAtTime(500, audio_ctx.currentTime);
    dialogue_beep.frequency.linearRampToValueAtTime(60, audio_ctx.currentTime + dialogue_beep_duration);
    dialogue_beep_gain.gain.value = 0.2;
    dialogue_beep_gain.gain.setValueAtTime(0, audio_ctx.currentTime + dialogue_beep_duration);

}

function audio_sound_explosion() {
    const duration = 1.5;
    const buffer_size = audio_ctx.sampleRate * duration;
    const buffer = audio_ctx.createBuffer(1, buffer_size, audio_ctx.sampleRate);
    let data = buffer.getChannelData(0);

    let phase = 0;
    let last_sample = 0;

    for (let i = 0; i < buffer_size; i++) {
        const t = i / audio_ctx.sampleRate;
        const frequency = 1200 * Math.pow(0.5, t);
        phase += frequency / audio_ctx.sampleRate;
        if(i % 1e4 == 0) console.log(frequency / audio_ctx.sampleRate);

        if(phase > 1) {
            phase -= Math.floor(phase);
            last_sample = Math.random() * 2 - 1;
        }
        data[i] = last_sample;
    }

    let noise = audio_ctx.createBufferSource();
    noise.buffer = buffer;

    let bandpass = audio_ctx.createBiquadFilter();
    bandpass.type = 'lowpass';
    bandpass.frequency.value = 440;

    let gain_node = audio_ctx.createGain();
    gain_node.gain.setValueAtTime(10, audio_ctx.currentTime);
    gain_node.gain.linearRampToValueAtTime(0, audio_ctx.currentTime + duration);

    noise.connect(bandpass).connect(gain_node).connect(audio_ctx.destination);
    noise.start(audio_ctx.currentTime);
}

/* ======= Updating ======= */
let last_dialogue_character_added = 0;

function cause_explosion() {
    last_explosion_time = elapsed_time;
    audio_sound_explosion();
}

function add_dialogue(dialogue) {
    if(dialogue_lines_done.length == 0) {
        dialogue_lines_done = [''];
    }
    dialogue_words_left.push(...dialogue.split(' '));
}

function dialogue_newline() {
    dialogue_words_left.push('\n');
}

function add_dialogue_nl(dialogue) {
    add_dialogue(dialogue);
    dialogue_newline();
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

    if(characters_to_add_to_line.length) {
        if(characters_to_add_to_line[0] == '#') {
            if(skip_dialogue_pressed || elapsed_time - last_dialogue_character_added > 0.5) {
                characters_to_add_to_line.shift();
                if(!skip_dialogue_pressed) last_dialogue_character_added += 0.5;
            }
        } else if(skip_dialogue_pressed || elapsed_time - last_dialogue_character_added > dialogue_rate) {
            last_dialogue_character_added = Math.max(last_dialogue_character_added, elapsed_time - 3 * dialogue_rate);
            do_audio_beep();
            if(!skip_dialogue_pressed) last_dialogue_character_added += dialogue_rate;
            dialogue_lines_done[dialogue_lines_done.length - 1] += characters_to_add_to_line[0];
            characters_to_add_to_line.shift();
        }
    }

    if(characters_to_add_to_line.length == 0 && dialogue_words_left.length == 0 && !need_space_to_proceed) {
        start_of_empty_dialogue = Math.min(start_of_empty_dialogue, elapsed_time);
        skip_dialogue_pressed = false;
    } else {
        start_of_empty_dialogue = Infinity;
    }

    if(stage == 1) {
        if(substage == 0 && stage_elapsed > 1) {
            add_dialogue_nl('[HYPERSPACE ANOMALY DETECTED] \n');
            add_dialogue_nl('# [STARTING SHIP AI] \n');
            add_dialogue_nl('# # # Hello there, # I am OSCaR, your Onboard Ship Computer and Resourcer. Please standby... \n');
            // console.log(Array.from(dialogue_words_left));
            substage = 1;
        } else if(substage == 1 && elapsed_time - start_of_empty_dialogue > 2) {
            player_x = -600;
            add_dialogue_nl('ALERT! Exiting hyperspeed!');
            can_skip_dialogue = false;
            need_space_to_proceed = true;
            substage = 2;
        } else if(substage == 2 && elapsed_time - start_of_empty_dialogue > 0.3) {
            dialogue_lines_done = [];
            can_skip_dialogue = true;
            need_space_to_proceed = true;
            add_dialogue_nl("I have detected some good news and some bad news. # The bad news is that the ship has exited hyperspace onto a planet 200 parsecs away from the target desination. # The good news is that all the ship's systems are intact...");
            substage = 3;
        } else if(substage == 3 && elapsed_time - start_of_empty_dialogue > 0.1) {
            cause_explosion();
            dialogue_lines_done = [];
            can_skip_dialogue = true;
            need_space_to_proceed = true;
            add_dialogue_nl("# # # # Update: I was wrong. It's all bad news actually. Almost every control is scrambled. In fact, the only thing that's working seems to be the internal gravitational actuator. I've wired up the [SPACE] button on your control matrix to it. Don't worry, the coarse navigation system should keep you from flying into the planet or up to outer space, but still... be careful.");
            substage = 4;
        }
    }
}

/* ======= Game Loop ======= */
function set_stage(new_stage) {
    if(stage == 0) {
        player_x = -1e20;
        exhaust_particles = [];
        init_audio();
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
    if(stages_with_dialogue_screen.includes(stage)) {
        if(dialogue_done_running()) {
            if(need_space_to_proceed) {
                need_space_to_proceed = false;
            }
        } else if(can_skip_dialogue) {
            skip_dialogue_pressed = true;
        }
    } else if(stage == 0) {
        set_stage(1);
    }
}

window.addEventListener('keydown', e => {
    if(e.code == 'Space') space_key_hit();
});