use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Vec3 { x, y, z }
    }
    pub fn dot(&self, other: &Vec3) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }
    pub fn cross(&self, other: &Vec3) -> Vec3 {
        Vec3 {
            x: self.y * other.z - self.z * other.y,
            y: self.z * other.x - self.x * other.z,
            z: self.x * other.y - self.y * other.x,
        }
    }
    pub fn normalize(&self) -> Vec3 {
        let length = (self.x * self.x + self.y * self.y + self.z * self.z).sqrt();
        if length > 0.0 {
            Vec3 {
                x: self.x / length,
                y: self.y / length,
                z: self.z / length,
            }
        } else {
            Vec3::new(0.0, 0.0, 0.0)
        }
    }
    pub fn sub(&self, other: &Vec3) -> Vec3 {
        Vec3 {
            x: self.x - other.x,
            y: self.y - other.y,
            z: self.z - other.z,
        }
    }
    pub fn add(&self, other: &Vec3) -> Vec3 {
        Vec3 {
            x: self.x + other.x,
            y: self.y + other.y,
            z: self.z + other.z,
        }
    }
    pub fn scale(&self, s: f64) -> Vec3 {
        Vec3 {
            x: self.x * s,
            y: self.y * s,
            z: self.z * s,
        }
    }
}

pub struct Ray {
    pub origin: Vec3,
    pub direction: Vec3,
}

#[derive(Serialize, Deserialize)]
pub struct Sphere {
    pub center: Vec3,
    pub radius: f64,
    pub color: Vec3, // RGB values (0.0 to 1.0)
    pub reflectivity: f64,
}

impl Sphere {
    // Returns distance to intersection, or None if no hit
    pub fn intersect(&self, ray: &Ray) -> Option<f64> {
        let oc = ray.origin.sub(&self.center);
        let a = ray.direction.dot(&ray.direction);
        let b = 2.0 * oc.dot(&ray.direction);
        let c = oc.dot(&oc) - self.radius * self.radius;
        let discriminant = b * b - 4.0 * a * c;

        if discriminant < 0.0 {
            None
        } else {
            let t = (-b - discriminant.sqrt()) / (2.0 * a);
            if t > 0.001 {
                Some(t)
            } else {
                let t_alt = (-b + discriminant.sqrt()) / (2.0 * a);
                if t_alt > 0.001 {
                    Some(t_alt)
                } else {
                    None
                }
            }
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct Light {
    pub position: Vec3,
    pub intensity: f64,
}

#[derive(Serialize, Deserialize)]
pub struct Camera {
    pub position: Vec3,
    // Note: Assuming a simple camera looking down -Z axis.
}

#[derive(Serialize, Deserialize)]
pub struct Scene {
    pub spheres: Vec<Sphere>,
    pub light: Light,
    pub camera: Camera,
}


impl Scene {
    fn trace(&self, ray: &Ray) -> Vec3 {
        let mut closest_t = std::f64::MAX;
        let mut hit_sphere = None;

        for sphere in &self.spheres {
            if let Some(t) = sphere.intersect(ray) {
                if t < closest_t {
                    closest_t = t;
                    hit_sphere = Some(sphere);
                }
            }
        }

        if let Some(sphere) = hit_sphere {
            let hit_point = ray.origin.add(&ray.direction.scale(closest_t));
            let normal = hit_point.sub(&sphere.center).normalize();
            let light_dir = self.light.position.sub(&hit_point).normalize();
            
            // Simple shadows
            let shadow_ray = Ray {
                origin: hit_point.add(&normal.scale(0.001)),
                direction: light_dir,
            };
            let mut shadow = false;
            for s in &self.spheres {
                if s.intersect(&shadow_ray).is_some() {
                    shadow = true;
                    break;
                }
            }

            // Diffuse shading
            let mut diffuse = normal.dot(&light_dir).max(0.0);
            if shadow {
                diffuse *= 0.1; // Ambient minimum
            } else {
                diffuse = (diffuse + 0.1).min(1.0); // Minimum ambient
            }

            // Simple coloring
            Vec3::new(
                sphere.color.x * diffuse,
                sphere.color.y * diffuse,
                sphere.color.z * diffuse,
            )
        } else {
            // Background color
            let t = 0.5 * (ray.direction.y + 1.0);
            Vec3::new(1.0 - t, 1.0 - t, 1.0 - t).add(&Vec3::new(0.5, 0.7, 1.0).scale(t))
        }
    }
}

#[wasm_bindgen]
pub fn render_tile(scene_json: &str, x_start: u32, y_start: u32, width: u32, height: u32, total_width: u32, total_height: u32) -> Vec<u8> {
    let mut pixels = Vec::with_capacity((width * height * 4) as usize);
    let scene: Scene = match serde_json::from_str(scene_json) {
        Ok(s) => s,
        Err(_) => return pixels, // Return empty on error
    };
    
    let aspect_ratio = total_width as f64 / total_height as f64;
    let viewport_height = 2.0;
    let viewport_width = aspect_ratio * viewport_height;
    let horizontal = Vec3::new(viewport_width, 0.0, 0.0);
    let vertical = Vec3::new(0.0, viewport_height, 0.0);
    let lower_left_corner = scene.camera.position.sub(&horizontal.scale(0.5)).sub(&vertical.scale(0.5)).sub(&Vec3::new(0.0, 0.0, 1.0));

    for j in y_start..(y_start + height) {
        for i in x_start..(x_start + width) {
            // Note: Canvas coordinates are top-down (0,0 is top-left)
            // Raytracer expects bottom-up, so we invert Y for math:
            let u = (i as f64) / ((total_width - 1) as f64);
            let v = 1.0 - ((j as f64) / ((total_height - 1) as f64));

            let ray_direction = lower_left_corner.add(&horizontal.scale(u)).add(&vertical.scale(v)).sub(&scene.camera.position).normalize();
            let ray = Ray {
                origin: scene.camera.position,
                direction: ray_direction,
            };

            let color = scene.trace(&ray);
            
            pixels.push((color.x.min(1.0).max(0.0) * 255.0) as u8);
            pixels.push((color.y.min(1.0).max(0.0) * 255.0) as u8);
            pixels.push((color.z.min(1.0).max(0.0) * 255.0) as u8);
            pixels.push(255); // Alpha
        }
    }
    
    pixels
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vec3_dot() {
        let v1 = Vec3::new(1.0, 2.0, 3.0);
        let v2 = Vec3::new(4.0, 5.0, 6.0);
        assert_eq!(v1.dot(&v2), 32.0);
    }

    #[test]
    fn test_intersect() {
        let sphere = Sphere {
            center: Vec3::new(0.0, 0.0, -5.0),
            radius: 1.0,
            color: Vec3::new(1.0, 1.0, 1.0),
            reflectivity: 0.0,
        };
        let ray = Ray {
            origin: Vec3::new(0.0, 0.0, 0.0),
            direction: Vec3::new(0.0, 0.0, -1.0),
        };
        assert_eq!(sphere.intersect(&ray), Some(4.0));
    }
}
