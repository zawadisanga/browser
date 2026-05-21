# terraform/main.tf - Infrastructure as Code
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "aws" {
  region = var.aws_region
  profile = var.aws_profile
}

# VPC Configuration
resource "aws_vpc" "zass_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = {
    Name = "zass-production-vpc"
    Environment = "production"
  }
}

# Subnets
resource "aws_subnet" "zass_public" {
  count             = 3
  vpc_id            = aws_vpc.zass_vpc.id
  cidr_block        = cidrsubnet(aws_vpc.zass_vpc.cidr_block, 4, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags = {
    Name = "zass-public-subnet-${count.index}"
  }
}

# EKS Cluster
resource "aws_eks_cluster" "zass_cluster" {
  name     = "zass-production-cluster"
  role_arn = aws_iam_role.eks_role.arn
  version  = "1.28"

  vpc_config {
    subnet_ids = aws_subnet.zass_public[*].id
  }

  tags = {
    Environment = "production"
  }
}

# RDS PostgreSQL
resource "aws_db_instance" "zass_postgres" {
  identifier     = "zass-postgres"
  engine         = "postgres"
  engine_version = "16.2"
  instance_class = "db.t3.large"
  allocated_storage = 100
  storage_encrypted = true
  db_name  = "zass_production"
  username = var.db_username
  password = var.db_password
  port     = 5432
  
  vpc_security_group_ids = [aws_security_group.rds_sg.id]
  db_subnet_group_name   = aws_db_subnet_group.zass_subnet_group.name
  
  backup_retention_period = 30
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"
  
  skip_final_snapshot = false
  final_snapshot_identifier = "zass-postgres-final"
  
  tags = {
    Name = "zass-production-postgres"
  }
}

# DocumentDB (MongoDB compatible)
resource "aws_docdb_cluster" "zass_mongodb" {
  cluster_identifier = "zass-mongodb"
  engine             = "docdb"
  master_username    = var.db_username
  master_password    = var.db_password
  port               = 27017
  instance_class     = "db.t3.medium"
  backup_retention_period = 30
  preferred_backup_window = "02:00-03:00"
  
  tags = {
    Name = "zass-production-mongodb"
  }
}

resource "aws_docdb_cluster_instance" "zass_mongodb_instances" {
  count              = 2
  identifier         = "zass-mongodb-${count.index}"
  cluster_identifier = aws_docdb_cluster.zass_mongodb.id
  instance_class     = "db.t3.medium"
}

# ElastiCache Redis
resource "aws_elasticache_cluster" "zass_redis" {
  cluster_id           = "zass-redis"
  engine              = "redis"
  node_type           = "cache.t3.medium"
  num_cache_nodes     = 2
  parameter_group_name = "default.redis7"
  port                = 6379
  
  tags = {
    Name = "zass-production-redis"
  }
}

# S3 Bucket for Uploads
resource "aws_s3_bucket" "zass_uploads" {
  bucket = "zass-production-uploads-${random_id.bucket_suffix.hex}"
  
  tags = {
    Name = "zass-uploads"
  }
}

resource "aws_s3_bucket_versioning" "zass_uploads" {
  bucket = aws_s3_bucket.zass_uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "zass_uploads" {
  bucket = aws_s3_bucket.zass_uploads.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# CloudFront CDN
resource "aws_cloudfront_distribution" "zass_cdn" {
  origin {
    domain_name = aws_s3_bucket.zass_uploads.bucket_regional_domain_name
    origin_id   = "S3-uploads"
  }
  
  origin {
    domain_name = aws_lb.zass_alb.dns_name
    origin_id   = "ALB"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }
  
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  
  aliases = ["cdn.zass.website", "assets.zass.website"]
  
  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "ALB"
    
    forwarded_values {
      query_string = true
      cookies {
        forward = "all"
      }
    }
    
    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }
  
  price_class = "PriceClass_All"
  
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  
  viewer_certificate {
    cloudfront_default_certificate = true
  }
  
  tags = {
    Name = "zass-cdn"
  }
}

# Application Load Balancer
resource "aws_lb" "zass_alb" {
  name               = "zass-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets           = aws_subnet.zass_public[*].id
  
  tags = {
    Name = "zass-alb"
  }
}

resource "aws_lb_target_group" "zass_api" {
  name     = "zass-api-tg"
  port     = 16232
  protocol = "HTTP"
  vpc_id   = aws_vpc.zass_vpc.id
  
  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/health"
  }
  
  stickiness {
    type    = "lb_cookie"
    enabled = true
  }
}

resource "aws_lb_listener" "zass_http" {
  load_balancer_arn = aws_lb.zass_alb.arn
  port              = "80"
  protocol          = "HTTP"
  
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "zass_https" {
  load_balancer_arn = aws_lb.zass_alb.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = aws_acm_certificate.zass_cert.arn
  
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.zass_api.arn
  }
}

# Auto Scaling Group for EC2 (if not using EKS)
resource "aws_launch_template" "zass_ec2" {
  name_prefix   = "zass-ec2-"
  image_id      = data.aws_ami.amazon_linux_2.id
  instance_type = "t3.large"
  
  user_data = base64encode(<<-EOF
    #!/bin/bash
    yum update -y
    amazon-linux-extras install docker -y
    systemctl start docker
    systemctl enable docker
    docker pull zass/enterprise-api:latest
    docker run -d -p 16232:16232 --name zass-api zass/enterprise-api:latest
  EOF
  )
  
  vpc_security_group_ids = [aws_security_group.ec2_sg.id]
}

resource "aws_autoscaling_group" "zass_asg" {
  name               = "zass-asg"
  vpc_zone_identifier = aws_subnet.zass_public[*].id
  min_size           = 2
  max_size           = 10
  desired_capacity   = 2
  
  launch_template {
    id      = aws_launch_template.zass_ec2.id
    version = "$Latest"
  }
  
  tag {
    key                 = "Name"
    value              = "zass-ec2"
    propagate_at_launch = true
  }
}

# Security Groups
resource "aws_security_group" "alb_sg" {
  name        = "zass-alb-sg"
  description = "Security group for ALB"
  vpc_id      = aws_vpc.zass_vpc.id
  
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ec2_sg" {
  name        = "zass-ec2-sg"
  description = "Security group for EC2"
  vpc_id      = aws_vpc.zass_vpc.id
  
  ingress {
    from_port       = 16232
    to_port         = 16232
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Random suffix for unique bucket names
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# Outputs
output "alb_dns_name" {
  value = aws_lb.zass_alb.dns_name
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.zass_cdn.domain_name
}

output "eks_cluster_endpoint" {
  value = aws_eks_cluster.zass_cluster.endpoint
}

output "rds_endpoint" {
  value = aws_db_instance.zass_postgres.endpoint
}
