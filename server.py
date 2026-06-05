import http.server
import socketserver
import json
import os
import subprocess
import threading
import signal
from urllib.parse import urlparse, parse_qs

PORT = 8000
yaml_dir = os.path.join(os.path.dirname(__file__), 'yaml')
os.makedirs(yaml_dir, exist_ok=True)

processes = {}

def kill_robot_process(robot):
    if robot in processes:
        p = processes[robot]
        try:
            # Kill the entire process group to ensure ros2 child processes die
            os.killpg(os.getpgid(p.pid), signal.SIGTERM)
        except Exception as e:
            print(f"Error killing process for {robot}: {e}")
        del processes[robot]

class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/stop':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            robot = data.get('robot')
            if robot:
                kill_robot_process(robot)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "stopped", "robot": robot}).encode())
            else:
                self.send_response(400)
                self.end_headers()
            return
            
        if parsed_path.path == '/launch':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            
            robot = data.get('robot')
            yaml_content = data.get('yaml')
            
            if not robot or not yaml_content:
                self.send_response(400)
                self.end_headers()
                return

            yaml_file = os.path.join(yaml_dir, f"graph_{robot}.yaml")
            with open(yaml_file, 'w') as f:
                f.write(yaml_content)
                
            # Kill existing process for this robot if running
            kill_robot_process(robot)
                
            cmd = [
                'bash', '-c',
                f'source /home/thehiub/ros2_ws/install/setup.bash && ros2 launch cpp_explorer cpp_explore.launch.py namespace:={robot} graph_yaml_path:={yaml_file}'
            ]
            
            # Start process in a new process group
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, preexec_fn=os.setsid)
            processes[robot] = p
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "launched", "robot": robot}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        parsed_path = urlparse(self.path)
        if parsed_path.path == '/logs':
            query = parse_qs(parsed_path.query)
            robot = query.get('robot', [''])[0]
            
            if not robot or robot not in processes:
                self.send_response(404)
                self.end_headers()
                return
                
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            
            p = processes[robot]
            try:
                for line in iter(p.stdout.readline, ''):
                    if not line and p.poll() is not None:
                        break
                    if line:
                        self.wfile.write(f"data: {line}\n\n".encode())
                        self.wfile.flush()
            except BrokenPipeError:
                pass
            return
            
        super().do_GET()

# Use ThreadingHTTPServer so SSE streams don't block other requests
class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True

if __name__ == '__main__':
    with ThreadedHTTPServer(("", PORT), RequestHandler) as httpd:
        print(f"Serving concurrently at http://localhost:{PORT}")
        print(f"YAML files will be saved to: {yaml_dir}")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down...")
            for robot in list(processes.keys()):
                kill_robot_process(robot)
