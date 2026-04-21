import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { NAI_Staff_Info } from '../models';
import { isAuthenticated } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { search, dept } = req.query;

    const whereClause: any = {
      Leave_Date: null
    };

    if (search) {
      whereClause[Op.or] = [
        { Lan_ID: { [Op.like]: `%${search}%` } },
        { Staff_Name: { [Op.like]: `%${search}%` } },
        { Emp_ID: { [Op.like]: `%${search}%` } }
      ];
    }

    if (dept) {
      whereClause.Department = dept;
    }

    const staff = await NAI_Staff_Info.findAll({
      where: whereClause,
      attributes: ['Emp_ID', 'Lan_ID', 'Staff_Name', 'Email_Addr', 'Department'],
      order: [['Lan_ID', 'ASC']],
      limit: 100
    });

    res.json({ success: true, data: staff });
  } catch (error) {
    logger.error('Error fetching staff:', error);
    res.status(500).json({ error: 'Failed to fetch staff' });
  }
});

router.get('/by-department/:dept', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { dept } = req.params;

    const staff = await NAI_Staff_Info.findAll({
      where: {
        Department: dept,
        Email_Addr: { [Op.ne]: '' },
        Leave_Date: null,
        Lan_ID: { [Op.ne]: '' }
      },
      attributes: ['Lan_ID', 'Staff_Name', 'Email_Addr'],
      order: [['Lan_ID', 'ASC']]
    });

    res.json({ success: true, data: staff });
  } catch (error) {
    logger.error('Error fetching staff by department:', error);
    res.status(500).json({ error: 'Failed to fetch staff' });
  }
});

router.get('/:empId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { empId } = req.params;

    const staff = await NAI_Staff_Info.findOne({
      where: { Emp_ID: empId },
      attributes: ['Emp_ID', 'Lan_ID', 'Staff_Name', 'Email_Addr', 'Department']
    });

    if (staff) {
      res.json({ success: true, data: staff });
    } else {
      res.json({ success: true, data: null });
    }
  } catch (error) {
    logger.error('Error fetching staff:', error);
    res.status(500).json({ error: 'Failed to fetch staff' });
  }
});

export default router;
