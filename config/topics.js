// ─── AC-SLAM Topic Configuration ────────────────────────────────────────────
// Update these to match your actual topic names (ros2 topic list)
// Everything else auto-updates from here.

export const TOPICS = {
  robot1: {
    map:       '/robot1/map',
    cmdVel:    '/robot1/cmd_vel',
    pose:      '/robot1/amcl_pose',
    graph:     '/robot1/explorer/graph',
    odom:      '/robot1/odom',
    scan:      '/robot1/scan',
  },
  robot2: {
    map:       '/robot2/map',
    cmdVel:    '/robot2/cmd_vel',
    pose:      '/robot2/amcl_pose',
    graph:     '/robot2/explorer/graph',
    odom:      '/robot2/odom',
    scan:      '/robot2/scan',
  },
  mergedMap:   '/merged_map',
};

export const SERVICES = {
  robot1: {
    setParams: '/robot1/cpp_explorer/set_parameters',
    getParams: '/robot1/cpp_explorer/get_parameters',
  },
  robot2: {
    setParams: '/robot2/cpp_explorer/set_parameters',
    getParams: '/robot2/cpp_explorer/get_parameters',
  },
};

export const ROSBRIDGE = {
  host: 'localhost',
  port: 9090,
};

// Explorer node default parameters
export const EXPLORER_PARAMS = [
  { name: 'exploration_radius',    type: 'double', default: 5.0,   min: 0.5, max: 50,   step: 0.5,  desc: 'Max exploration radius (m)' },
  { name: 'goal_tolerance',        type: 'double', default: 0.3,   min: 0.05, max: 2.0, step: 0.05, desc: 'Goal reach tolerance (m)' },
  { name: 'obstacle_inflation',    type: 'double', default: 0.25,  min: 0.0, max: 2.0,  step: 0.05, desc: 'Obstacle inflation (m)' },
  { name: 'planning_timeout',      type: 'double', default: 10.0,  min: 1.0, max: 60.0, step: 1.0,  desc: 'Planning timeout (s)' },
  { name: 'recovery_enabled',      type: 'bool',   default: true,                                    desc: 'Enable recovery behaviors' },
  { name: 'max_retries',           type: 'int',    default: 3,     min: 0,   max: 20,   step: 1,    desc: 'Max navigation retries' },
];
